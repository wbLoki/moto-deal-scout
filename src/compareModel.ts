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
  AvitoListingFetchError,
  fetchAvitoListing,
} from './infrastructure/sources/avito/fetchAvitoListing.js';
import {
  BikerListingFetchError,
  fetchBikerListing,
} from './infrastructure/sources/biker/fetchBikerListing.js';
import { openDatabase, resolveDatabaseConfig } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';

export type { BikeEvaluation, BikeInput } from './application/services/evaluateBike.js';

/** Marketplace URL could not be resolved (unknown host, scrape fail, …). */
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

/** Already-scraped Avito/Biker rows in Turso (fallback when live fetch fails). */
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

/**
 * Opens the marketplace page / API (or our DB) and builds a {@link BikeInput}.
 * Avito: Cloudflare Browser Rendering first, then DB fallback.
 * Biker: public JSON API.
 */
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

    try {
      const listing = await fetchAvitoListing(ref.url);
      return bikeInputFromListing(listing);
    } catch (liveErr) {
      const fromDb = await bikeInputFromStoredUrl(ref);
      if (fromDb) return fromDb;
      if (liveErr instanceof AvitoListingFetchError) {
        throw new ListingUrlScanError(liveErr.message);
      }
      throw liveErr;
    }
  } catch (err) {
    if (err instanceof ListingUrlScanError) throw err;
    if (err instanceof BikerListingFetchError || err instanceof AvitoListingFetchError) {
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
 * - Avito URL → Browser Rendering (Workers binding), DB fallback, then evaluate.
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
