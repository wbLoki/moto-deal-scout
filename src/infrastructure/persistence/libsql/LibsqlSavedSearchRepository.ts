import type { Client } from '@libsql/client';
import type { SavedSearch } from '../../../domain/entities/SavedSearch.js';
import {
  isFuelType,
  isGearboxType,
  parseVehicleType,
  type VehicleType,
} from '../../../domain/entities/VehicleType.js';
import type { SavedSearchRepository } from '../../../domain/interfaces/SavedSearchRepository.js';

interface SavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: string;
  budget_min: number;
  budget_max: number;
  year_min: number;
  year_max: number;
  mileage_max: number;
  brands: string;
  cities: string;
  fuel_types: string;
  gearboxes: string;
  model_ids: string;
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function mapRow(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    vehicleType: parseVehicleType(row.vehicle_type),
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    yearMin: row.year_min,
    yearMax: row.year_max,
    mileageMax: row.mileage_max ?? 0,
    brands: parseStringArray(row.brands),
    cities: parseStringArray(row.cities),
    fuelTypes: parseStringArray(row.fuel_types).filter(isFuelType),
    gearboxes: parseStringArray(row.gearboxes).filter(isGearboxType),
    modelIds: parseStringArray(row.model_ids),
  };
}

const SELECT = `id, user_id, name, vehicle_type, budget_min, budget_max, year_min, year_max,
                mileage_max, brands, cities, fuel_types, gearboxes, model_ids`;

function toArgs(s: SavedSearch): Array<string | number> {
  return [
    s.id,
    s.userId,
    s.name,
    s.vehicleType,
    s.budgetMin,
    s.budgetMax,
    s.yearMin,
    s.yearMax,
    s.mileageMax,
    JSON.stringify(s.brands),
    JSON.stringify(s.cities),
    JSON.stringify(s.fuelTypes),
    JSON.stringify(s.gearboxes),
    JSON.stringify(s.modelIds),
  ];
}

export class LibsqlSavedSearchRepository implements SavedSearchRepository {
  constructor(private readonly client: Client) {}

  async listForUser(userId: string, vehicleType?: VehicleType): Promise<SavedSearch[]> {
    const result = vehicleType
      ? await this.client.execute({
          sql: `SELECT ${SELECT} FROM user_saved_searches
                WHERE user_id = ? AND vehicle_type = ? ORDER BY created_at DESC`,
          args: [userId, vehicleType],
        })
      : await this.client.execute({
          sql: `SELECT ${SELECT} FROM user_saved_searches
                WHERE user_id = ? ORDER BY created_at DESC`,
          args: [userId],
        });
    return (result.rows as unknown as SavedSearchRow[]).map(mapRow);
  }

  async get(id: string, userId: string): Promise<SavedSearch | undefined> {
    const result = await this.client.execute({
      sql: `SELECT ${SELECT} FROM user_saved_searches WHERE id = ? AND user_id = ?`,
      args: [id, userId],
    });
    const row = result.rows[0] as unknown as SavedSearchRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  async insert(search: SavedSearch): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO user_saved_searches
              (id, user_id, name, vehicle_type, budget_min, budget_max, year_min, year_max,
               mileage_max, brands, cities, fuel_types, gearboxes, model_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: toArgs(search),
    });
  }

  async update(search: SavedSearch): Promise<void> {
    await this.client.execute({
      sql: `UPDATE user_saved_searches SET
              name = ?, vehicle_type = ?, budget_min = ?, budget_max = ?,
              year_min = ?, year_max = ?, mileage_max = ?, brands = ?, cities = ?,
              fuel_types = ?, gearboxes = ?, model_ids = ?
            WHERE id = ? AND user_id = ?`,
      args: [
        search.name,
        search.vehicleType,
        search.budgetMin,
        search.budgetMax,
        search.yearMin,
        search.yearMax,
        search.mileageMax,
        JSON.stringify(search.brands),
        JSON.stringify(search.cities),
        JSON.stringify(search.fuelTypes),
        JSON.stringify(search.gearboxes),
        JSON.stringify(search.modelIds),
        search.id,
        search.userId,
      ],
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM user_saved_searches WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
  }

  async listAll(): Promise<SavedSearch[]> {
    const result = await this.client.execute(`SELECT ${SELECT} FROM user_saved_searches`);
    return (result.rows as unknown as SavedSearchRow[]).map(mapRow);
  }
}
