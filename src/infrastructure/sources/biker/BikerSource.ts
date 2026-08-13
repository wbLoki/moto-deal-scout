import type { Logger } from 'pino';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import { crawlPages } from '../shared/crawl.js';
import { delay } from '../shared/throttle.js';
import { parseNumber, slugifyWithHyphens } from '../shared/textParsing.js';

const BASE_URL = 'https://www.biker.ma';
const LIST_PATH = '/api/v1/moto/annonce';
const PHOTO_BASE = `${BASE_URL}/uploads/`;
/** Page size matching Biker's public list endpoint default. */
export const BIKER_PAGE_LIMIT = 45;
const DEFAULT_MAX_PAGES = 3;

/** One row from `/api/v1/moto/annonce`. */
interface BikerAnnonce {
  readonly idannonce_moto?: number;
  readonly marque?: string | null;
  readonly model?: string | null;
  readonly titre?: string | null;
  readonly description?: string | null;
  readonly prix?: number | string | null;
  readonly anneemodele?: number | string | null;
  readonly kilometrage?: number | string | null;
  readonly cylindre?: number | string | null;
  readonly ville?: string | null;
  readonly dateajout?: string | null;
  readonly photo1?: string | null;
  readonly etatannonce?: string | null;
  readonly vendu?: number | null;
}

interface BikerAnnoncePage {
  readonly annonces?: readonly BikerAnnonce[];
  readonly page?: number;
  readonly totalPages?: number;
  readonly total?: number;
}

export interface BikerSourceOptions {
  readonly throttleMs: number;
  readonly maxPages?: number;
  /** Items per API page (default {@link BIKER_PAGE_LIMIT}). */
  readonly pageLimit?: number;
}

/**
 * Builds the Biker list API URL. Empty `modele` browses the whole catalogue
 * (discovery); a non-empty value filters like the old HTML search.
 */
export function buildBikerUrl(model: string, page: number, limit = BIKER_PAGE_LIMIT): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (model) params.set('modele', model);
  return `${BASE_URL}${LIST_PATH}?${params.toString()}`;
}

/**
 * Fetches Biker.ma used-motorcycle listings via their public JSON API
 * (`/api/v1/moto/annonce`) — no browser required. Detail enrich still hits
 * `/api/v1/moto/detail/{id}` when a list row is missing date/cc (rare).
 */
export class BikerSource implements MarketplaceSource {
  readonly id = 'biker' as const;
  readonly name = 'Biker.ma';

  private readonly pageLimit: number;

  constructor(
    private readonly options: BikerSourceOptions,
    private readonly logger: Logger,
  ) {
    this.pageLimit = options.pageLimit ?? BIKER_PAGE_LIMIT;
  }

  async fetchListings(query: SourceQuery): Promise<Listing[]> {
    const model = query.criteria?.model ?? '';
    const maxPages = query.maxPages ?? this.options.maxPages ?? DEFAULT_MAX_PAGES;

    return crawlPages({
      maxPages,
      throttleMs: this.options.throttleMs,
      ...(query.postedAfter ? { postedAfter: query.postedAfter } : {}),
      ...(query.seenBefore ? { seenBefore: query.seenBefore } : {}),
      fetchPage: (pageNumber) => this.fetchPage(buildBikerUrl(model, pageNumber, this.pageLimit)),
      onError: (err, pageNumber) =>
        this.logger.error({ err, model, pageNumber }, 'Biker.ma list API failed'),
    });
  }

  /**
   * Fills in `postedAt` / `displacementCc` when the list row omitted them.
   * The list API usually already provides both, so this is a no-op for most
   * crawls. Failures leave the listing untouched.
   */
  async enrich(listing: Listing): Promise<Listing> {
    if (listing.postedAt && listing.displacementCc !== undefined) return listing;

    try {
      await delay(this.options.throttleMs);
      const res = await fetch(`${BASE_URL}/api/v1/moto/detail/${listing.externalId}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return listing;
      const data = await res.json<{ dateajout?: string; cylindre?: string | number }>();
      const posted = data.dateajout ? new Date(data.dateajout) : undefined;
      const postedAt = posted && !Number.isNaN(posted.getTime()) ? posted : listing.postedAt;
      const cc = parseNumber(String(data.cylindre ?? ''));
      const displacementCc = cc && cc >= 25 && cc <= 3500 ? cc : listing.displacementCc;
      return { ...listing, postedAt, displacementCc };
    } catch (err) {
      this.logger.warn({ err, externalId: listing.externalId }, 'Biker.ma detail enrich failed');
      return listing;
    }
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  private async fetchPage(url: string): Promise<Listing[]> {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Biker.ma list API HTTP ${res.status} for ${url}`);
    }
    const data = await res.json<BikerAnnoncePage>();
    const rows = data.annonces ?? [];
    const scrapedAt = new Date();
    return rows
      .map((row) => this.toListing(row, scrapedAt))
      .filter((l): l is Listing => l !== undefined);
  }

  private toListing(row: BikerAnnonce, scrapedAt: Date): Listing | undefined {
    if (row.vendu === 1 || (row.etatannonce && row.etatannonce !== 'active')) {
      return undefined;
    }

    const externalId = String(row.idannonce_moto ?? '');
    if (!externalId) return undefined;

    const priceMAD =
      typeof row.prix === 'number' ? row.prix : parseNumber(String(row.prix ?? ''));
    if (priceMAD == null || !(priceMAD > 0)) return undefined;

    const brand = (row.marque ?? '').trim();
    const model = (row.model ?? '').trim();
    // Prefer marque+model for catalog matching — titres are often city names
    // or vague slogans ("larache", "a vendre").
    const title =
      [brand, model].filter(Boolean).join(' ') ||
      (row.titre ?? '').trim() ||
      `Biker #${externalId}`;

    const year =
      typeof row.anneemodele === 'number'
        ? row.anneemodele
        : parseNumber(String(row.anneemodele ?? ''));
    const mileageKm =
      typeof row.kilometrage === 'number'
        ? row.kilometrage
        : parseNumber(String(row.kilometrage ?? ''));
    const cc = parseNumber(String(row.cylindre ?? ''));
    const displacementCc = cc && cc >= 25 && cc <= 3500 ? cc : undefined;

    const posted = row.dateajout ? new Date(row.dateajout) : undefined;
    const photo = (row.photo1 ?? '').trim();
    const slug = slugifyWithHyphens(title) || 'moto';

    return {
      sourceId: this.id,
      externalId,
      url: `${BASE_URL}/annonce/detail-moto/${slug}/${externalId}`,
      title,
      description: row.description?.trim() || undefined,
      priceMAD,
      year: year != null && year >= 1950 ? year : undefined,
      mileageKm,
      displacementCc,
      vehicleType: 'motorcycle',
      fuelType: undefined,
      gearbox: undefined,
      city: (row.ville ?? '').trim() || 'Maroc',
      imageUrl: photo ? `${PHOTO_BASE}${photo}` : undefined,
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted : undefined,
      scrapedAt,
    };
  }
}
