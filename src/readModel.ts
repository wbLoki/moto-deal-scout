import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchCriteria, SearchRange } from './domain/entities/SearchCriteria.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlSettingsRepository } from './infrastructure/persistence/libsql/LibsqlSettingsRepository.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';

export interface DashboardData {
  readonly criteria: SearchCriteria;
  readonly goodDeals: readonly ScoredListing[];
  readonly searchRange: SearchRange;
}

/**
 * Lightweight read path for the web dashboard: opens the database once,
 * reads the recent good deals and the current search range, and closes —
 * without spinning up the browser or marketplace sources a scan needs.
 */
export async function getDashboardData(limit = 50): Promise<DashboardData> {
  const env = loadEnv();
  const criteria = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  const repository = new LibsqlListingRepository(db, criteria.models);
  try {
    const goodDeals = await repository.getRecentGoodDeals(limit);
    const storedRange = await new LibsqlSettingsRepository(db).getSearchRange();
    return { criteria, goodDeals, searchRange: storedRange ?? DEFAULT_SEARCH_RANGE };
  } finally {
    await repository.close();
  }
}
