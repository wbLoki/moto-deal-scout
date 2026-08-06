import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlSavedListingRepository } from './infrastructure/persistence/libsql/LibsqlSavedListingRepository.js';

/** Bookmark or un-bookmark a single listing for a user. */
export async function setSavedListing(
  userId: string,
  sourceId: string,
  externalId: string,
  saved: boolean,
): Promise<void> {
  const db = await openDatabase(resolveDatabaseConfig(loadEnv()));
  try {
    const repo = new LibsqlSavedListingRepository(db);
    if (saved) await repo.add(userId, sourceId, externalId);
    else await repo.remove(userId, sourceId, externalId);
  } finally {
    db.close();
  }
}
