import type { SearchRange } from './domain/entities/SearchCriteria.js';
import type { VehicleType } from './domain/entities/VehicleType.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { defaultSearchRangeFor, parseSearchRange } from './settingsModel.js';

/** A user's saved range, or the default if they haven't set one. */
export async function getUserSearchRange(
  userId: string,
  vehicleType: VehicleType = 'motorcycle',
): Promise<SearchRange> {
  const db = await openDatabaseFromEnv();
  try {
    const stored = await new LibsqlUserSearchRangeRepository(db).get(userId, vehicleType);
    return stored ?? defaultSearchRangeFor(vehicleType);
  } finally {
    db.close();
  }
}

/** Validates and persists a user's range. */
export async function saveUserSearchRange(
  userId: string,
  input: unknown,
  vehicleType: VehicleType = 'motorcycle',
): Promise<SearchRange> {
  const range = parseSearchRange(input);
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlUserSearchRangeRepository(db).save(userId, range, vehicleType);
    return range;
  } finally {
    db.close();
  }
}
