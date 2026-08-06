import type { MarketplaceId } from '../entities/Listing.js';
import type { ScoredListing } from '../entities/ScoredListing.js';

/**
 * Persistence boundary for "have we already told the user about this
 * listing". Swap the implementation for anything else (Postgres, a JSON
 * file, ...) without touching application logic.
 */
export interface ListingRepository {
  /** True if this exact listing (by source + external id) has been stored before. */
  hasSeen(sourceId: MarketplaceId, externalId: string): Promise<boolean>;

  /** Persist a newly-seen, scored listing. Upserts if called twice. */
  save(scored: ScoredListing): Promise<void>;

  /** Good deals stored since the given date, most recent first. Used for report regeneration. */
  getGoodDealsSince(sinceDate: Date): Promise<ScoredListing[]>;

  /** The most recent good deals, most recent first. Used by the daily report/notifications. */
  getRecentGoodDeals(limit: number): Promise<ScoredListing[]>;

  /** The most recent listings of any tier, most recent first. Powers the dashboard. */
  getRecentListings(limit: number): Promise<ScoredListing[]>;

  /**
   * The highest-scored listings of any tier, best deal first. Powers the
   * "best deals" feed. Ordering by score rather than insert time keeps a
   * large one-off batch (e.g. a discovery crawl) from monopolizing the page
   * and burying every earlier listing.
   */
  getTopScoredListings(limit: number): Promise<ScoredListing[]>;

  /** All listings (any tier) stored since the given date, most recent first. */
  getListingsSince(sinceDate: Date): Promise<ScoredListing[]>;

  /** Prices (MAD) of listings matched to a model and last seen since the date. For calibration. */
  getPricesForModel(modelId: string, seenSince: Date): Promise<number[]>;

  /** The stored price of a listing, or undefined if it isn't stored yet. */
  getStoredPrice(sourceId: MarketplaceId, externalId: string): Promise<number | undefined>;

  /** Records a price drop on an already-stored listing (updates price, keeps the old one). */
  recordPriceDrop(
    sourceId: MarketplaceId,
    externalId: string,
    newPriceMAD: number,
    oldPriceMAD: number,
  ): Promise<void>;

  /** Release the underlying connection. Safe to call multiple times. */
  close(): Promise<void>;
}
