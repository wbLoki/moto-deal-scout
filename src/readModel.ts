import { unstable_cache } from 'next/cache';
import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import { DEFAULT_SORT, PAGE_SIZE, type SortKey } from './domain/entities/DealSort.js';
import type { StoredModel } from './domain/entities/Model.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type {
  ModelCriteria,
  SearchCriteria,
  SearchRange,
} from './domain/entities/SearchCriteria.js';
import type {
  DealFacets,
  DealQuery,
  DealTab,
  TabCounts,
} from './domain/interfaces/ListingRepository.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlSavedListingRepository } from './infrastructure/persistence/libsql/LibsqlSavedListingRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { seedModelsOnce } from './infrastructure/persistence/libsql/seedModelsOnce.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';

/** Cache tag for the anonymous homepage; invalidate after scans/admin model edits. */
export const PUBLIC_DASHBOARD_TAG = 'public-dashboard';

/** The order tabs are auto-selected in for first paint — first non-empty wins. */
const TAB_PRIORITY: readonly DealTab[] = ['daily', 'watched', 'saved', 'all'];

/**
 * The filter/sort/page controls the dashboard sends back for each feed request.
 * Mirrors the client's sidebar state; the server answers it entirely in SQL.
 */
export interface DealsPageInput {
  readonly tab: DealTab;
  readonly search: string;
  readonly mileageMin: number;
  /** `0` means "no upper bound". */
  readonly mileageMax: number;
  readonly ccMin: number;
  /** `0` means "no upper bound". */
  readonly ccMax: number;
  readonly ratings: readonly string[];
  readonly cities: readonly string[];
  readonly brands: readonly string[];
  readonly sort: SortKey;
  readonly page: number;
}

/** One page of the feed plus the fresh per-tab counts, returned to the client. */
export interface DealsPage {
  readonly deals: readonly ScoredListing[];
  readonly total: number;
  readonly tabCounts: TabCounts;
}

/** Everything the dashboard needs for its first server-rendered paint. */
export interface DashboardData {
  readonly criteria: SearchCriteria;
  readonly onboarded: boolean;
  readonly searchRange: SearchRange;
  readonly watchedModelIds: readonly string[];
  /** Keys ("source:external") of the user's bookmarks, for optimistic save state. */
  readonly savedKeys: readonly string[];
  /** Filter dropdown options, derived from the whole in-range set. */
  readonly facets: DealFacets;
  readonly tabCounts: TabCounts;
  /** Tab shown on first paint (first non-empty of daily/watched/saved/all). */
  readonly initialTab: DealTab;
  readonly initialSort: SortKey;
  /** First page of `initialTab`, already filtered and sorted in SQL. */
  readonly initialDeals: readonly ScoredListing[];
  readonly initialTotal: number;
}

/** Derive enabled scan criteria from a single listAll() result (avoids a second query). */
function enabledCriteriaFrom(allModels: readonly StoredModel[]): ModelCriteria[] {
  return allModels
    .filter((m) => m.enabled)
    .map(
      ({
        enabled: _e,
        autoCalibrate: _a,
        calibratedAt: _at,
        calibratedSamples: _n,
        discoveredAt: _d,
        ...criteria
      }) => criteria,
    );
}

/** The neutral, unfiltered page-1 request used for first paint and facets/counts. */
function baseInput(tab: DealTab = 'all'): DealsPageInput {
  return {
    tab,
    search: '',
    mileageMin: 0,
    mileageMax: 0,
    ccMin: 0,
    ccMax: 0,
    ratings: [],
    cities: [],
    brands: [],
    sort: DEFAULT_SORT,
    page: 1,
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Assembles a full {@link DealQuery} from a request's controls + resolved context. */
function toDealQuery(
  userId: string,
  ctx: { range: SearchRange; minPriceFactor: number; watchedModelIds: readonly string[] },
  input: DealsPageInput,
): DealQuery {
  return {
    userId,
    tab: input.tab,
    range: ctx.range,
    minPriceFactor: ctx.minPriceFactor,
    watchedModelIds: ctx.watchedModelIds,
    search: input.search,
    mileageMin: input.mileageMin,
    mileageMax: input.mileageMax,
    ccMin: input.ccMin,
    ccMax: input.ccMax,
    ratings: input.ratings,
    cities: input.cities,
    brands: input.brands,
    sort: input.sort,
    page: input.page,
    pageSize: PAGE_SIZE,
    startOfToday: startOfToday().toISOString(),
  };
}

/**
 * Per-user dashboard read for first paint. Opens the database once and returns
 * onboarding state, the user's range/watchlist/bookmarks, the filter facets,
 * per-tab counts, and the first page of the first non-empty tab — every filter
 * and sort now resolved in SQL rather than in the browser.
 */
export async function getDashboardData(userId: string): Promise<DashboardData> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    await seedModelsOnce(db, config.models);
    const allModels = await new LibsqlModelRepository(db).listAll();
    const enabledModels = enabledCriteriaFrom(allModels);
    const listings = new LibsqlListingRepository(db, allModels);

    const profileRepo = new LibsqlUserProfileRepository(db);
    const rangeRepo = new LibsqlUserSearchRangeRepository(db);
    const savedRepo = new LibsqlSavedListingRepository(db);
    const [onboarded, watchedModelIds, storedRange, savedKeys] = await Promise.all([
      profileRepo.isOnboarded(userId),
      profileRepo.getWatchedModelIds(userId),
      rangeRepo.get(userId),
      savedRepo.listSavedKeys(userId),
    ]);
    const searchRange = storedRange ?? DEFAULT_SEARCH_RANGE;

    const ctx = {
      range: searchRange,
      minPriceFactor: config.global.minPriceFactor,
      watchedModelIds,
    };
    const [facets, tabCounts] = await Promise.all([
      listings.getDealFacets(toDealQuery(userId, ctx, baseInput())),
      listings.countDealsByTab(toDealQuery(userId, ctx, baseInput())),
    ]);

    const initialTab = TAB_PRIORITY.find((t) => tabCounts[t] > 0) ?? 'all';
    const { deals: initialDeals, total: initialTotal } = await listings.queryDeals(
      toDealQuery(userId, ctx, baseInput(initialTab)),
    );

    return {
      criteria: { models: enabledModels, global: config.global },
      onboarded,
      searchRange,
      watchedModelIds,
      savedKeys,
      facets,
      tabCounts,
      initialTab,
      initialSort: DEFAULT_SORT,
      initialDeals,
      initialTotal,
    };
  } finally {
    db.close();
  }
}

/**
 * Answers one filter/sort/page request from the dashboard: the requested page
 * of the chosen tab plus refreshed per-tab counts. Called by the client's
 * server action on every interaction.
 */
export async function getDealsPage(userId: string, input: DealsPageInput): Promise<DealsPage> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    // No seed on filter clicks — models exist after first paint / scan / admin.
    const allModels = await new LibsqlModelRepository(db).listAll();
    const listings = new LibsqlListingRepository(db, allModels);

    const [storedRange, watchedModelIds] = await Promise.all([
      new LibsqlUserSearchRangeRepository(db).get(userId),
      new LibsqlUserProfileRepository(db).getWatchedModelIds(userId),
    ]);
    const ctx = {
      range: storedRange ?? DEFAULT_SEARCH_RANGE,
      minPriceFactor: config.global.minPriceFactor,
      watchedModelIds,
    };

    const q = toDealQuery(userId, ctx, input);
    const [{ deals, total }, tabCounts] = await Promise.all([
      listings.queryDeals(q),
      listings.countDealsByTab(q),
    ]);
    return { deals, total, tabCounts };
  } finally {
    db.close();
  }
}

/**
 * The public feed's filter/sort/page controls. Unlike the member dashboard —
 * whose budget/year window is a saved setting — anonymous visitors set budget
 * and year live in the sidebar, so those travel with each request. No tabs, no
 * watchlist, no saved list.
 */
export interface PublicDealsInput {
  readonly search: string;
  readonly budgetMin: number;
  readonly budgetMax: number;
  readonly yearMin: number;
  readonly yearMax: number;
  readonly mileageMin: number;
  /** `0` means "no upper bound". */
  readonly mileageMax: number;
  readonly ccMin: number;
  /** `0` means "no upper bound". */
  readonly ccMax: number;
  readonly ratings: readonly string[];
  readonly cities: readonly string[];
  readonly brands: readonly string[];
  readonly sort: SortKey;
  readonly page: number;
}

/** Everything the public homepage needs for its first server-rendered paint. */
export interface PublicDashboardData {
  readonly initialDeals: readonly ScoredListing[];
  readonly initialTotal: number;
  readonly initialSort: SortKey;
  /** Filter options + slider bounds, over the whole plausible catalog. */
  readonly facets: DealFacets;
}

/** Unbounded range for the unfiltered public first paint and its facets. */
const PUBLIC_WIDE_RANGE: SearchRange = {
  budgetMin: 0,
  budgetMax: Number.MAX_SAFE_INTEGER,
  yearMin: 0,
  yearMax: 9999,
};

/** Builds a {@link DealQuery} for the anonymous feed (no user, single "all" tab). */
function toPublicDealQuery(input: PublicDealsInput, minPriceFactor: number): DealQuery {
  return {
    userId: '',
    tab: 'all',
    range: {
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      yearMin: input.yearMin,
      yearMax: input.yearMax,
    },
    minPriceFactor,
    watchedModelIds: [],
    search: input.search,
    mileageMin: input.mileageMin,
    mileageMax: input.mileageMax,
    ccMin: input.ccMin,
    ccMax: input.ccMax,
    ratings: input.ratings,
    cities: input.cities,
    brands: input.brands,
    sort: input.sort,
    page: input.page,
    pageSize: PAGE_SIZE,
    startOfToday: '',
  };
}

async function loadPublicDashboardUncached(): Promise<PublicDashboardData> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    await seedModelsOnce(db, config.models);
    const allModels = await new LibsqlModelRepository(db).listAll();
    const listings = new LibsqlListingRepository(db, allModels);

    const wide = toPublicDealQuery(
      {
        search: '',
        budgetMin: PUBLIC_WIDE_RANGE.budgetMin,
        budgetMax: PUBLIC_WIDE_RANGE.budgetMax,
        yearMin: PUBLIC_WIDE_RANGE.yearMin,
        yearMax: PUBLIC_WIDE_RANGE.yearMax,
        mileageMin: 0,
        mileageMax: 0,
        ccMin: 0,
        ccMax: 0,
        ratings: [],
        cities: [],
        brands: [],
        sort: DEFAULT_SORT,
        page: 1,
      },
      config.global.minPriceFactor,
    );
    const [{ deals, total }, facets] = await Promise.all([
      listings.queryDeals(wide),
      listings.getDealFacets(wide),
    ]);
    return { initialDeals: deals, initialTotal: total, initialSort: DEFAULT_SORT, facets };
  } finally {
    db.close();
  }
}

/**
 * Public homepage first paint: cached briefly so anonymous `/` is not a full
 * Turso round-trip on every visit. Invalidate via {@link PUBLIC_DASHBOARD_TAG}.
 */
export const getPublicDashboard = unstable_cache(
  loadPublicDashboardUncached,
  ['public-dashboard'],
  { revalidate: 60, tags: [PUBLIC_DASHBOARD_TAG] },
);

/** Answers one filter/sort/page request from the anonymous public feed. */
export async function getPublicDealsPage(
  input: PublicDealsInput,
): Promise<{ deals: ScoredListing[]; total: number }> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const allModels = await new LibsqlModelRepository(db).listAll();
    const listings = new LibsqlListingRepository(db, allModels);
    // Must await before the finally closes the client — returning the pending
    // promise would let db.close() fire mid-query ("Client was closed").
    return await listings.queryDeals(toPublicDealQuery(input, config.global.minPriceFactor));
  } finally {
    db.close();
  }
}
