import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { estimateAndEvaluate } from './application/services/aiPriceEstimator.js';
import { parseListing } from './application/services/aiListingParser.js';
import { CatalogModelResolver } from './application/services/CatalogModelResolver.js';
import {
  extractListingUrl,
  type ParsedListingUrl,
} from './application/services/parseListingUrl.js';
import { evaluateBike, type BikeEvaluation, type BikeInput } from './application/services/evaluateBike.js';
import type { Listing } from './domain/entities/Listing.js';
import { createAiExtractor } from './infrastructure/ai/aiExtractor.js';
import {
  BikerListingFetchError,
  fetchBikerListing,
} from './infrastructure/sources/biker/fetchBikerListing.js';
import { openDatabase, resolveDatabaseConfig } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';

export type { BikeEvaluation, BikeInput } from './application/services/evaluateBike.js';

/** Marketplace URL could not be resolved (unknown host, missing scrape, API fail, …). */
export class ListingUrlScanError extends Error {
  override readonly name = 'ListingUrlScanError';
  constructor(message: string) {
    super(message);
  }
}

/**
 * Server entry for the public compare page: loads the enabled models and the
 * global scoring config, then delegates to the pure {@link evaluateBike}. Opens
 * and closes the database per request, mirroring the read-model helpers.
 */
export async function getBikeEvaluation(input: BikeInput): Promise<BikeEvaluation> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const models = await new LibsqlModelRepository(db).listEnabledCriteria();
    return evaluateBike(input, { models, global: config.global });
  } finally {
    db.close();
  }
}

/**
 * AI fallback for a bike we don't have market data on: Claude estimates a fair
 * range and we score against it. No database needed — only the global scoring
 * config. Throws `AiUnavailableError` when no API key is set (caller maps it to
 * a friendly state).
 */
export async function getAiEstimate(input: BikeInput): Promise<BikeEvaluation> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const ai = createAiExtractor();
  return estimateAndEvaluate(ai, input, config.global);
}

/** The fields pulled from an ad/link, plus how our engine rates them. */
export interface PastedListingResult {
  readonly extracted: BikeInput;
  readonly evaluation: BikeEvaluation;
}

function bikeInputFromListing(
  listing: Listing,
  hint?: { brand?: string; model?: string },
): BikeInput {
  const match =
    new CatalogModelResolver().resolve(
      `${listing.title} ${listing.description?.slice(0, 120) ?? ''}`.trim(),
    ) ??
    (hint?.brand && hint?.model
      ? { brand: hint.brand, model: hint.model, confidence: 1 }
      : undefined);

  const brand = match?.brand ?? hint?.brand ?? listing.title.split(/\s+/)[0] ?? 'Unknown';
  const stripped = listing.title.replace(new RegExp(`^${brand}\\s*`, 'i'), '').trim();
  const model = match?.model ?? hint?.model ?? (stripped || listing.title);

  return {
    brand,
    model,
    ...(listing.year != null ? { year: listing.year } : {}),
    ...(listing.mileageKm != null ? { mileageKm: listing.mileageKm } : {}),
    ...(listing.displacementCc != null ? { displacementCc: listing.displacementCc } : {}),
    priceMAD: listing.priceMAD,
    ...(listing.city.trim() ? { city: listing.city } : {}),
  };
}

/**
 * Avito (and any already-scraped) links resolve from our DB — Playwright cannot
 * run on Cloudflare Workers, and importing it breaks the OpenNext esbuild step
 * (`chromium-bidi` unresolved). Biker still uses their JSON API (no browser).
 */
async function bikeInputFromStoredUrl(ref: ParsedListingUrl): Promise<BikeInput | undefined> {
  const env = loadEnv();
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const models = await new LibsqlModelRepository(db).listAll();
    const scored = await new LibsqlListingRepository(db, models).findBySourceExternalId(
      ref.sourceId,
      ref.externalId,
    );
    if (!scored) return undefined;
    return bikeInputFromListing(scored.listing, {
      brand: scored.match.criteria.brand,
      model: scored.match.criteria.model,
    });
  } finally {
    db.close();
  }
}

/** Opens the marketplace page / API (or our DB) and builds a {@link BikeInput} with price. */
async function scanListingUrl(url: string): Promise<BikeInput> {
  const ref = extractListingUrl(url);
  if (!ref) {
    throw new ListingUrlScanError('Paste an Avito.ma or Biker.ma listing link.');
  }

  try {
    if (ref.sourceId === 'biker') {
      const { listing, brand, model } = await fetchBikerListing(ref.url);
      return bikeInputFromListing(listing, { brand, model });
    }

    const fromDb = await bikeInputFromStoredUrl(ref);
    if (fromDb) return fromDb;
    throw new ListingUrlScanError(
      'We haven’t scraped that Avito listing yet. Paste the ad text instead, or try again after the daily scan.',
    );
  } catch (err) {
    if (err instanceof ListingUrlScanError) throw err;
    if (err instanceof BikerListingFetchError) {
      throw new ListingUrlScanError(err.message);
    }
    throw new ListingUrlScanError(
      err instanceof Error ? err.message : 'Could not scan that listing link.',
    );
  }
}

/**
 * Parses a pasted ad or marketplace URL into structured fields, then rates it.
 *
 * - Biker URL → live JSON API scan, then evaluate.
 * - Avito URL → lookup in our scraped listings DB (no Playwright on Workers), then evaluate.
 * - Free-text ad → AI extraction, then evaluate.
 */
export async function getPastedListingEvaluation(text: string): Promise<PastedListingResult> {
  const listingRef = extractListingUrl(text);
  if (listingRef) {
    const extracted = await scanListingUrl(listingRef.url);
    const evaluation = await getBikeEvaluation(extracted);
    return { extracted, evaluation };
  }

  const ai = createAiExtractor();
  const extracted = await parseListing(ai, text);
  const evaluation = await getBikeEvaluation(extracted);
  return { extracted, evaluation };
}
