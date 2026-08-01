import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchCriteria, SearchRange } from './domain/entities/SearchCriteria.js';
import { listingWithinRange } from './domain/services/rangeFilter.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';

export interface DashboardData {
  readonly criteria: SearchCriteria;
  /** Good deals within the user's range, newest first. */
  readonly goodDeals: readonly ScoredListing[];
  /** The user's current range (their own, or the default). */
  readonly searchRange: SearchRange;
  /** Good deals stored before the user's range filter was applied. */
  readonly totalBeforeFilter: number;
}

// The shared scan can store more good deals than we show; fetch a generous
// page, filter by the user's range, then cap at `limit`.
const FETCH_MULTIPLIER = 5;

/**
 * Per-user dashboard read: opens the database once, reads recent good deals
 * (shared across all users) and this user's budget/year range, and returns
 * only the deals inside that range.
 */
export async function getDashboardData(userId: string, limit = 60): Promise<DashboardData> {
  const env = loadEnv();
  const criteria = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  const listings = new LibsqlListingRepository(db, criteria.models);
  try {
    const allGood = await listings.getRecentGoodDeals(limit * FETCH_MULTIPLIER);
    const storedRange = await new LibsqlUserSearchRangeRepository(db).get(userId);
    const searchRange = storedRange ?? DEFAULT_SEARCH_RANGE;
    const inRange = allGood.filter((d) => listingWithinRange(d.listing, searchRange));
    return {
      criteria,
      goodDeals: inRange.slice(0, limit),
      searchRange,
      totalBeforeFilter: allGood.length,
    };
  } finally {
    await listings.close();
  }
}
