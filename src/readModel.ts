import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchCriteria, SearchRange } from './domain/entities/SearchCriteria.js';
import { listingWithinRange } from './domain/services/rangeFilter.js';
import { priceIsPlausible } from './domain/services/priceFilter.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';

export interface DashboardData {
  readonly criteria: SearchCriteria;
  readonly onboarded: boolean;
  /** Good deals within the user's range, newest first. */
  readonly allDeals: readonly ScoredListing[];
  /** Range-filtered deals first found today (the latest scan). */
  readonly dailyDeals: readonly ScoredListing[];
  /** Range-filtered deals for the models the user follows. */
  readonly watchedDeals: readonly ScoredListing[];
  readonly watchedModelIds: readonly string[];
  readonly searchRange: SearchRange;
  /** Good deals stored before the user's range filter was applied. */
  readonly totalBeforeFilter: number;
}

// The shared scan can store more good deals than we show; fetch a generous
// page, filter by the user's range, then cap at `limit`.
const FETCH_MULTIPLIER = 5;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Per-user dashboard read. Opens the database once and returns everything the
 * dashboard needs: onboarding state, the user's followed models and range,
 * and the recent good deals grouped into all / today / watched — each already
 * filtered to the user's budget/year range.
 */
export async function getDashboardData(userId: string, limit = 60): Promise<DashboardData> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.seedIfEmpty(config.models);
    const allModels = await modelRepo.listAll();
    const enabledModels = await modelRepo.listEnabledCriteria();

    const profileRepo = new LibsqlUserProfileRepository(db);
    const [onboarded, watchedModelIds] = await Promise.all([
      profileRepo.isOnboarded(userId),
      profileRepo.getWatchedModelIds(userId),
    ]);

    const listings = new LibsqlListingRepository(db, allModels);
    const storedRange = await new LibsqlUserSearchRangeRepository(db).get(userId);
    const searchRange = storedRange ?? DEFAULT_SEARCH_RANGE;

    // Hide implausibly-cheap listings (typos/deposits) that may have been
    // stored before the scan-time price floor existed.
    const plausible = (d: ScoredListing): boolean =>
      priceIsPlausible(
        d.listing.priceMAD,
        d.match.criteria.priceRangeMAD.min,
        config.global.minPriceFactor,
      );

    const recent = (await listings.getRecentGoodDeals(limit * FETCH_MULTIPLIER)).filter(plausible);
    const recentInRange = recent.filter((d) => listingWithinRange(d.listing, searchRange));

    const today = (await listings.getGoodDealsSince(startOfToday())).filter(plausible);
    const todayInRange = today.filter((d) => listingWithinRange(d.listing, searchRange));

    const watchedSet = new Set(watchedModelIds);
    const watchedDeals = recentInRange.filter((d) => watchedSet.has(d.match.criteria.id));

    return {
      criteria: { models: enabledModels, global: config.global },
      onboarded,
      allDeals: recentInRange.slice(0, limit),
      dailyDeals: todayInRange.slice(0, limit),
      watchedDeals: watchedDeals.slice(0, limit),
      watchedModelIds,
      searchRange,
      totalBeforeFilter: recent.length,
    };
  } finally {
    db.close();
  }
}
