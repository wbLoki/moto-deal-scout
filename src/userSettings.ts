import type { SearchRange } from './domain/entities/SearchCriteria.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { DEFAULT_SEARCH_RANGE, parseSearchRange } from './settingsModel.js';

/** A user's saved range, or the default if they haven't set one. */
export async function getUserSearchRange(userId: string): Promise<SearchRange> {
  const db = await openDatabaseFromEnv();
  try {
    const stored = await new LibsqlUserSearchRangeRepository(db).get(userId);
    return stored ?? DEFAULT_SEARCH_RANGE;
  } finally {
    db.close();
  }
}

/** Validates and persists a user's range. */
export async function saveUserSearchRange(userId: string, input: unknown): Promise<SearchRange> {
  const range = parseSearchRange(input);
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlUserSearchRangeRepository(db).save(userId, range);
    return range;
  } finally {
    db.close();
  }
}
