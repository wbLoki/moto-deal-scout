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

  /** All listings (any tier) stored since the given date, most recent first. */
  getListingsSince(sinceDate: Date): Promise<ScoredListing[]>;

  /** Release the underlying connection. Safe to call multiple times. */
  close(): Promise<void>;
}
