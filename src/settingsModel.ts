import { loadEnv } from './config/env.js';
import { searchRangeSchema } from './config/criteriaSchema.js';
import { resolveDatabaseConfig } from './container.js';
import type { SearchRange } from './domain/entities/SearchCriteria.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlSettingsRepository } from './infrastructure/persistence/libsql/LibsqlSettingsRepository.js';

/** Used until the user saves a range of their own. */
export const DEFAULT_SEARCH_RANGE: SearchRange = {
  budgetMin: 0,
  budgetMax: 200000,
  yearMin: 2015,
  yearMax: new Date().getFullYear() + 1,
};

/**
 * Validates untrusted input (e.g. a form submission) into a SearchRange.
 * Throws a readable error if it's malformed or min/max are inverted.
 */
export function parseSearchRange(input: unknown): SearchRange {
  const result = searchRangeSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Invalid search range: ${details}`);
  }
  return result.data;
}

/** Current stored range, or {@link DEFAULT_SEARCH_RANGE} if none has been saved. */
export async function getSearchRange(): Promise<SearchRange> {
  const db = await openDatabase(resolveDatabaseConfig(loadEnv()));
  try {
    const stored = await new LibsqlSettingsRepository(db).getSearchRange();
    return stored ?? DEFAULT_SEARCH_RANGE;
  } finally {
    db.close();
  }
}

/** Validates and persists a new search range. */
export async function saveSearchRange(input: unknown): Promise<SearchRange> {
  const range = parseSearchRange(input);
  const db = await openDatabase(resolveDatabaseConfig(loadEnv()));
  try {
    await new LibsqlSettingsRepository(db).saveSearchRange(range);
    return range;
  } finally {
    db.close();
  }
}
