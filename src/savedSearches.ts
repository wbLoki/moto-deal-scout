import { randomUUID } from 'node:crypto';
import type { NewSavedSearch, SavedSearch } from './domain/entities/SavedSearch.js';
import type { VehicleType } from './domain/entities/VehicleType.js';
import { parseVehicleType } from './domain/entities/VehicleType.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlSavedSearchRepository } from './infrastructure/persistence/libsql/LibsqlSavedSearchRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { parseSearchRange } from './settingsModel.js';

export interface SavedSearchInput {
  readonly name: string;
  readonly vehicleType: VehicleType;
  readonly budgetMin: number;
  readonly budgetMax: number;
  readonly yearMin: number;
  readonly yearMax: number;
  readonly mileageMax?: number;
  readonly brands?: readonly string[];
  readonly cities?: readonly string[];
  readonly fuelTypes?: readonly string[];
  readonly gearboxes?: readonly string[];
  readonly modelIds?: readonly string[];
}

function normalize(input: SavedSearchInput): NewSavedSearch {
  const range = parseSearchRange({
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    yearMin: input.yearMin,
    yearMax: input.yearMax,
  });
  const name = input.name.trim().slice(0, 80) || (input.vehicleType === 'car' ? 'Cars' : 'Motos');
  return {
    name,
    vehicleType: parseVehicleType(input.vehicleType),
    budgetMin: range.budgetMin,
    budgetMax: range.budgetMax,
    yearMin: range.yearMin,
    yearMax: range.yearMax,
    mileageMax: Math.max(0, Math.floor(input.mileageMax ?? 0)),
    brands: [...new Set((input.brands ?? []).map((b) => b.trim()).filter(Boolean))],
    cities: [...new Set((input.cities ?? []).map((c) => c.trim()).filter(Boolean))],
    fuelTypes: (input.fuelTypes ?? []).filter(
      (f): f is NewSavedSearch['fuelTypes'][number] =>
        f === 'essence' || f === 'diesel' || f === 'hybrid' || f === 'electric' || f === 'lpg',
    ),
    gearboxes: (input.gearboxes ?? []).filter(
      (g): g is NewSavedSearch['gearboxes'][number] => g === 'manual' || g === 'automatic',
    ),
    modelIds: [...new Set((input.modelIds ?? []).filter(Boolean))],
  };
}

export async function listSavedSearches(
  userId: string,
  vehicleType?: VehicleType,
): Promise<SavedSearch[]> {
  const db = await openDatabaseFromEnv();
  try {
    return await new LibsqlSavedSearchRepository(db).listForUser(userId, vehicleType);
  } finally {
    db.close();
  }
}

export async function createSavedSearch(
  userId: string,
  input: SavedSearchInput,
  opts: { completeOnboarding?: boolean } = {},
): Promise<SavedSearch> {
  const body = normalize(input);
  const search: SavedSearch = { id: randomUUID(), userId, ...body };
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlSavedSearchRepository(db).insert(search);
    if (opts.completeOnboarding) {
      await new LibsqlUserProfileRepository(db).markOnboarded(userId);
    }
    return search;
  } finally {
    db.close();
  }
}

export async function updateSavedSearch(
  userId: string,
  id: string,
  input: SavedSearchInput,
): Promise<void> {
  const body = normalize(input);
  const db = await openDatabaseFromEnv();
  try {
    const repo = new LibsqlSavedSearchRepository(db);
    const existing = await repo.get(id, userId);
    if (!existing) throw new Error('Saved search not found');
    await repo.update({ ...existing, ...body, id, userId });
  } finally {
    db.close();
  }
}

export async function deleteSavedSearch(userId: string, id: string): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlSavedSearchRepository(db).delete(id, userId);
  } finally {
    db.close();
  }
}
