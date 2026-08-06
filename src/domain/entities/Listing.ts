/**
 * Marketplace identifiers. Add new sources here as they're implemented.
 * `moteur` is no longer scraped but is retained so historical rows stored
 * under that source still read back cleanly.
 */
export type MarketplaceId = 'avito' | 'biker' | 'moteur';

/**
 * A normalized listing as scraped from a marketplace, before any scoring
 * or model matching has been applied.
 */
export interface Listing {
  readonly sourceId: MarketplaceId;
  /** Identifier unique within the source (ad id, URL slug, ...). */
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly priceMAD: number;
  readonly year: number | undefined;
  readonly mileageKm: number | undefined;
  readonly city: string;
  readonly imageUrl: string | undefined;
  /** Publish date reported by the marketplace, when available. */
  readonly postedAt: Date | undefined;
  readonly scrapedAt: Date;
  /**
   * When we first stored this listing (DB `created_at`), as an ISO string.
   * Populated when read back from the database; undefined for a listing
   * freshly scraped in-memory. Drives the "newest first" sort.
   */
  readonly firstSeenAt?: string;
}

/** Stable key used for dedupe and "have we seen this before" lookups. */
export function listingKey(listing: Pick<Listing, 'sourceId' | 'externalId'>): string {
  return `${listing.sourceId}:${listing.externalId}`;
}
