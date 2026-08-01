import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchCriteria } from './domain/entities/SearchCriteria.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';

export interface DashboardData {
  readonly criteria: SearchCriteria;
  readonly goodDeals: readonly ScoredListing[];
}

/**
 * Lightweight read path for the web dashboard: opens the database, reads
 * the most recent good deals, and closes — without spinning up the browser
 * or marketplace sources that a full scan needs.
 */
export async function getDashboardData(limit = 50): Promise<DashboardData> {
  const env = loadEnv();
  const criteria = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  const repository = new LibsqlListingRepository(db, criteria.models);
  try {
    const goodDeals = await repository.getRecentGoodDeals(limit);
    return { criteria, goodDeals };
  } finally {
    await repository.close();
  }
}
