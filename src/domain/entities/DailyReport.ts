import type { Listing, MarketplaceId } from './Listing.js';
import type { ScoredListing } from './ScoredListing.js';
import type { ModelCriteria } from './SearchCriteria.js';

export interface SourceRunSummary {
  readonly sourceId: MarketplaceId;
  readonly listingsFound: number;
  readonly newListings: number;
  readonly error: string | undefined;
}

/** An already-seen listing whose price dropped since we last stored it. */
export interface PriceDrop {
  readonly listing: Listing;
  readonly model: ModelCriteria;
  readonly oldPriceMAD: number;
  readonly newPriceMAD: number;
}

/** Summary of one scan run, sent as the daily digest regardless of whether any deals were found. */
export interface DailyReport {
  readonly runAt: Date;
  readonly sources: readonly SourceRunSummary[];
  readonly totalListingsScanned: number;
  readonly newListingsSeen: number;
  readonly goodDeals: readonly ScoredListing[];
  /** Already-seen listings whose price fell this run. */
  readonly priceDrops: readonly PriceDrop[];
}
