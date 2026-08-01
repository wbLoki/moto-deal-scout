import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchCriteria, SearchRange } from './domain/entities/SearchCriteria.js';
import { listingWithinRange } from './domain/services/rangeFilter.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
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
 * only the deals inside that range. Models come from the DB (admin-managed).
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

    const listings = new LibsqlListingRepository(db, allModels);
    const allGood = await listings.getRecentGoodDeals(limit * FETCH_MULTIPLIER);
    const storedRange = await new LibsqlUserSearchRangeRepository(db).get(userId);
    const searchRange = storedRange ?? DEFAULT_SEARCH_RANGE;
    const inRange = allGood.filter((d) => listingWithinRange(d.listing, searchRange));

    return {
      criteria: { models: enabledModels, global: config.global },
      goodDeals: inRange.slice(0, limit),
      searchRange,
      totalBeforeFilter: allGood.length,
    };
  } finally {
    db.close();
  }
}
