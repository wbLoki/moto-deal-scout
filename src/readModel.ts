import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import { DEFAULT_SORT, PAGE_SIZE, type SortKey } from './domain/entities/DealSort.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchCriteria, SearchRange } from './domain/entities/SearchCriteria.js';
import type {
  DealFacets,
  DealQuery,
  DealTab,
  TabCounts,
} from './domain/interfaces/ListingRepository.js';
import { priceIsPlausible } from './domain/services/priceFilter.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlSavedListingRepository } from './infrastructure/persistence/libsql/LibsqlSavedListingRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';

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

// The scan stores more listings than we show; fetch a generous page, filter
// by the user's range, sort best-first, then cap at `limit`.
const FETCH_MULTIPLIER = 5;

/** The neutral, unfiltered page-1 request used for first paint and facets/counts. */
function baseInput(tab: DealTab = 'all'): DealsPageInput {
  return {
    tab,
    search: '',
    mileageMin: 0,
    mileageMax: 0,
    ratings: [],
    cities: [],
    brands: [],
    sort: DEFAULT_SORT,
    page: 1,
  };
}

function byScoreDesc(a: ScoredListing, b: ScoredListing): number {
  return b.score.total - a.score.total;
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
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.seedIfEmpty(config.models);
    const allModels = await modelRepo.listAll();
    const enabledModels = await modelRepo.listEnabledCriteria();
    const listings = new LibsqlListingRepository(db, allModels);

    const profileRepo = new LibsqlUserProfileRepository(db);
    const [onboarded, watchedModelIds] = await Promise.all([
      profileRepo.isOnboarded(userId),
      profileRepo.getWatchedModelIds(userId),
    ]);
    const storedRange = await new LibsqlUserSearchRangeRepository(db).get(userId);
    const searchRange = storedRange ?? DEFAULT_SEARCH_RANGE;
    const savedKeys = await new LibsqlSavedListingRepository(db).listSavedKeys(userId);

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
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.seedIfEmpty(config.models);
    const allModels = await modelRepo.listAll();
    const listings = new LibsqlListingRepository(db, allModels);

    const storedRange = await new LibsqlUserSearchRangeRepository(db).get(userId);
    const watchedModelIds = await new LibsqlUserProfileRepository(db).getWatchedModelIds(userId);
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
 * Public, no-login read: the top-scored recent listings across all models,
 * with no per-user range filter — just plausibly priced and sorted best-first.
 * Shared by the public homepage feed (`getPublicDeals`) and the smaller landing
 * teaser (`getHotDeals`); the only difference is how many deals are returned.
 */
async function readPublicDeals(limit: number): Promise<ScoredListing[]> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.seedIfEmpty(config.models);
    const allModels = await modelRepo.listAll();

    const listings = new LibsqlListingRepository(db, allModels);
    const recent = await listings.getTopScoredListings(limit * FETCH_MULTIPLIER);
    return recent
      .filter((d) =>
        priceIsPlausible(
          d.listing.priceMAD,
          d.match.criteria.priceRangeMAD.min,
          config.global.minPriceFactor,
        ),
      )
      .sort(byScoreDesc)
      .slice(0, limit);
  } finally {
    db.close();
  }
}

/**
 * The full public deal feed shown to anonymous visitors on the homepage. Same
 * shape and scoring as the member feed, minus the per-user budget/year filter.
 */
export function getPublicDeals(limit = 60): Promise<ScoredListing[]> {
  return readPublicDeals(limit);
}

/** A small teaser of the globally hottest deals (e.g. for marketing sections). */
export function getHotDeals(limit = 6): Promise<ScoredListing[]> {
  return readPublicDeals(limit);
}
