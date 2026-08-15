import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { DEFAULT_SORT, PAGE_SIZE, type SortKey } from './domain/entities/DealSort.js';
import type { StoredModel } from './domain/entities/Model.js';
import type { MarketplaceId } from './domain/entities/Listing.js';
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
import { openDatabase, resolveDatabaseConfig } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlSavedListingRepository } from './infrastructure/persistence/libsql/LibsqlSavedListingRepository.js';
import { LibsqlSavedSearchRepository } from './infrastructure/persistence/libsql/LibsqlSavedSearchRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import type { FuelType, GearboxType, VehicleType } from './domain/entities/VehicleType.js';
import type { SavedSearch } from './domain/entities/SavedSearch.js';
import { seedModelsOnce } from './infrastructure/persistence/libsql/seedModelsOnce.js';
import { defaultSearchRangeFor } from './settingsModel.js';

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
  readonly vehicleType: VehicleType;
  readonly search: string;
  readonly mileageMin: number;
  /** `0` means "no upper bound". */
  readonly mileageMax: number;
  readonly ccMin: number;
  /** `0` means "no upper bound". */
  readonly ccMax: number;
  readonly fuelTypes: readonly FuelType[];
  readonly gearboxes: readonly GearboxType[];
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
  readonly savedSearchCount: number;
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
function baseInput(tab: DealTab = 'all', vehicleType: VehicleType = 'motorcycle'): DealsPageInput {
  return {
    tab,
    vehicleType,
    search: '',
    mileageMin: 0,
    mileageMax: 0,
    ccMin: 0,
    ccMax: 0,
    fuelTypes: [],
    gearboxes: [],
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
  ctx: {
    range: SearchRange;
    minPriceFactor: number;
    savedSearches: readonly SavedSearch[];
    vehicleType: VehicleType;
  },
  input: DealsPageInput,
): DealQuery {
  return {
    userId,
    tab: input.tab,
    vehicleType: ctx.vehicleType,
    range: ctx.range,
    minPriceFactor: ctx.minPriceFactor,
    savedSearches: ctx.savedSearches,
    search: input.search,
    mileageMin: input.mileageMin,
    mileageMax: input.mileageMax,
    ccMin: input.ccMin,
    ccMax: input.ccMax,
    fuelTypes: input.fuelTypes,
    gearboxes: input.gearboxes,
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
export async function getDashboardData(
  userId: string,
  vehicleType: VehicleType = 'motorcycle',
): Promise<DashboardData> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    await seedModelsOnce(db, config.models);
    const allModels = await new LibsqlModelRepository(db).listAll();
    const enabledModels = enabledCriteriaFrom(allModels).filter((m) => m.vehicleType === vehicleType);
    const listings = new LibsqlListingRepository(db, allModels);

    const profileRepo = new LibsqlUserProfileRepository(db);
    const rangeRepo = new LibsqlUserSearchRangeRepository(db);
    const savedRepo = new LibsqlSavedListingRepository(db);
    const searchRepo = new LibsqlSavedSearchRepository(db);
    const [onboarded, storedRange, savedKeys, savedSearches] = await Promise.all([
      profileRepo.isOnboarded(userId),
      rangeRepo.get(userId, vehicleType),
      savedRepo.listSavedKeys(userId),
      searchRepo.listForUser(userId, vehicleType),
    ]);
    const searchRange = storedRange ?? defaultSearchRangeFor(vehicleType);

    const ctx = {
      range: searchRange,
      minPriceFactor: config.global.minPriceFactor,
      savedSearches,
      vehicleType,
    };
    const [facets, tabCounts] = await Promise.all([
      listings.getDealFacets(toDealQuery(userId, ctx, baseInput('all', vehicleType))),
      listings.countDealsByTab(toDealQuery(userId, ctx, baseInput('all', vehicleType))),
    ]);

    const initialTab = TAB_PRIORITY.find((t) => tabCounts[t] > 0) ?? 'all';
    const { deals: initialDeals, total: initialTotal } = await listings.queryDeals(
      toDealQuery(userId, ctx, baseInput(initialTab, vehicleType)),
    );

    return {
      criteria: { models: enabledModels, global: config.global },
      onboarded,
      searchRange,
      savedSearchCount: savedSearches.length,
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

    const [storedRange, savedSearches] = await Promise.all([
      new LibsqlUserSearchRangeRepository(db).get(userId, input.vehicleType),
      new LibsqlSavedSearchRepository(db).listForUser(userId, input.vehicleType),
    ]);
    const ctx = {
      range: storedRange ?? defaultSearchRangeFor(input.vehicleType),
      minPriceFactor: config.global.minPriceFactor,
      savedSearches,
      vehicleType: input.vehicleType,
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
  readonly fuelTypes: readonly FuelType[];
  readonly gearboxes: readonly GearboxType[];
  readonly ratings: readonly string[];
  readonly cities: readonly string[];
  readonly brands: readonly string[];
  readonly sort: SortKey;
  readonly page: number;
  readonly vehicleType: VehicleType;
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
    vehicleType: input.vehicleType,
    range: {
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      yearMin: input.yearMin,
      yearMax: input.yearMax,
    },
    minPriceFactor,
    savedSearches: [],
    search: input.search,
    mileageMin: input.mileageMin,
    mileageMax: input.mileageMax,
    ccMin: input.ccMin,
    ccMax: input.ccMax,
    fuelTypes: input.fuelTypes,
    gearboxes: input.gearboxes,
    ratings: input.ratings,
    cities: input.cities,
    brands: input.brands,
    sort: input.sort,
    page: input.page,
    pageSize: PAGE_SIZE,
    startOfToday: '',
  };
}

function emptyPublicInput(vehicleType: VehicleType): PublicDealsInput {
  return {
    search: '',
    budgetMin: PUBLIC_WIDE_RANGE.budgetMin,
    budgetMax: PUBLIC_WIDE_RANGE.budgetMax,
    yearMin: PUBLIC_WIDE_RANGE.yearMin,
    yearMax: PUBLIC_WIDE_RANGE.yearMax,
    mileageMin: 0,
    mileageMax: 0,
    ccMin: 0,
    ccMax: 0,
    fuelTypes: [],
    gearboxes: [],
    ratings: [],
    cities: [],
    brands: [],
    sort: DEFAULT_SORT,
    page: 1,
    vehicleType,
  };
}

async function loadPublicDashboardUncached(
  vehicleType: VehicleType,
): Promise<PublicDashboardData> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    await seedModelsOnce(db, config.models);
    const allModels = await new LibsqlModelRepository(db).listAll();
    const listings = new LibsqlListingRepository(db, allModels);

    const wide = toPublicDealQuery(emptyPublicInput(vehicleType), config.global.minPriceFactor);
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
  async (vehicleType: VehicleType = 'motorcycle') => loadPublicDashboardUncached(vehicleType),
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
    return await listings.queryDeals(toPublicDealQuery(input, config.global.minPriceFactor));
  } finally {
    db.close();
  }
}

export async function getModelYearMarket(input: {
  readonly modelId: string;
  readonly year: number | null;
  readonly vehicleType: VehicleType;
  readonly sourceId: string;
  readonly externalId: string;
  readonly listingPrice: number;
}) {
  const env = loadEnv();
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const allModels = await new LibsqlModelRepository(db).listAll();
    return await new LibsqlListingRepository(db, allModels).getModelYearMarket({
      modelId: input.modelId,
      year: input.year,
      vehicleType: input.vehicleType,
      sourceId: input.sourceId as MarketplaceId,
      externalId: input.externalId,
      listingPrice: input.listingPrice,
    });
  } finally {
    db.close();
  }
}

/** One scored listing for the public `/l/[sourceId]/[externalId]` page. */
export const getScoredListing = cache(
  async (sourceId: MarketplaceId, externalId: string): Promise<ScoredListing | undefined> => {
    const env = loadEnv();
    const db = await openDatabase(resolveDatabaseConfig(env));
    try {
      const allModels = await new LibsqlModelRepository(db).listAll();
      return await new LibsqlListingRepository(db, allModels).findBySourceExternalId(
        sourceId,
        externalId,
      );
    } finally {
      db.close();
    }
  },
);
