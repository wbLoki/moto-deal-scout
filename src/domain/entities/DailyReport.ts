import type { MarketplaceId } from './Listing.js';
import type { ScoredListing } from './ScoredListing.js';

export interface SourceRunSummary {
  readonly sourceId: MarketplaceId;
  readonly listingsFound: number;
  readonly newListings: number;
  readonly error: string | undefined;
}

/** Summary of one scan run, sent as the daily digest regardless of whether any deals were found. */
export interface DailyReport {
  readonly runAt: Date;
  readonly sources: readonly SourceRunSummary[];
  readonly totalListingsScanned: number;
  readonly newListingsSeen: number;
  readonly goodDeals: readonly ScoredListing[];
}
