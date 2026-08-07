import type { SortKey } from '../entities/DealSort.js';
import type { MarketplaceId } from '../entities/Listing.js';
import type { ScoredListing } from '../entities/ScoredListing.js';
import type { SearchRange } from '../entities/SearchCriteria.js';

/** The four dashboard feeds. `saved` deliberately ignores the budget/year range. */
export type DealTab = 'all' | 'daily' | 'watched' | 'saved';

/**
 * A fully-resolved dashboard feed query. Every filter/sort/page control the
 * dashboard exposes is expressed here and answered in SQL, so the browser only
 * ever holds the page it is showing.
 */
export interface DealQuery {
  readonly userId: string;
  readonly tab: DealTab;
  /** Budget/year window. Ignored when `tab === 'saved'`. */
  readonly range: SearchRange;
  /** Multiplier for the implausible-price floor (`price >= fairMin * factor`). */
  readonly minPriceFactor: number;
  /** The user's followed model ids; scopes the `watched` tab. */
  readonly watchedModelIds: readonly string[];
  /** Free-text query over brand/model/city. Empty = no text filter. */
  readonly search: string;
  readonly mileageMin: number;
  /** Upper mileage bound; `0` means "no upper bound". */
  readonly mileageMax: number;
  /** Deal-tier levels to include (e.g. `['hot','great']`). Empty = all. */
  readonly ratings: readonly string[];
  /** Lowercased city keys. Empty = all. */
  readonly cities: readonly string[];
  /** Lowercased brand keys. Empty = all. */
  readonly brands: readonly string[];
  readonly sort: SortKey;
  /** 1-based page number. */
  readonly page: number;
  readonly pageSize: number;
  /** ISO start-of-today, used by the `daily` tab. */
  readonly startOfToday: string;
}

/** Unfiltered per-tab totals for the tab badges (respect range, ignore search/filters). */
export interface TabCounts {
  readonly all: number;
  readonly daily: number;
  readonly watched: number;
  readonly saved: number;
}

/** The filter dropdown options, derived from the in-range set rather than one page. */
export interface DealFacets {
  /** Distinct brands, original casing, sorted. */
  readonly brands: readonly string[];
  /** Distinct cities, original casing, sorted. */
  readonly cities: readonly string[];
  /** Largest mileage seen, for the mileage slider's upper bound. */
  readonly maxMileage: number;
}

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

  /**
   * One page of the dashboard feed: applies every filter/sort in `query` in
   * SQL and returns the requested page plus the total matching count (for the
   * pager). Backs the server-driven dashboard.
   */
  queryDeals(query: DealQuery): Promise<{ deals: ScoredListing[]; total: number }>;

  /**
   * Per-tab totals for the tab badges. Respects the budget/year range (and the
   * user's watched set / saved list) but ignores the search box and filters,
   * matching what the tab counts have always shown.
   */
  countDealsByTab(query: DealQuery): Promise<TabCounts>;

  /**
   * Distinct brands/cities and the max mileage across the user's in-range set,
   * for populating the filter dropdowns independently of the current page.
   */
  getDealFacets(query: DealQuery): Promise<DealFacets>;

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
