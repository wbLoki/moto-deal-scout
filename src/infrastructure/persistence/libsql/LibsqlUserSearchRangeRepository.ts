import type { Client } from '@libsql/client';
import type { SearchRange } from '../../../domain/entities/SearchCriteria.js';
import type { VehicleType } from '../../../domain/entities/VehicleType.js';
import type { UserSearchRangeRepository } from '../../../domain/interfaces/UserSearchRangeRepository.js';

interface RangeRow {
  budget_min: number;
  budget_max: number;
  year_min: number;
  year_max: number;
}

const UPSERT_SQL = `
  INSERT INTO user_vehicle_search_ranges
    (user_id, vehicle_type, budget_min, budget_max, year_min, year_max, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT (user_id, vehicle_type) DO UPDATE SET
    budget_min = excluded.budget_min,
    budget_max = excluded.budget_max,
    year_min = excluded.year_min,
    year_max = excluded.year_max,
    updated_at = excluded.updated_at
`;

export class LibsqlUserSearchRangeRepository implements UserSearchRangeRepository {
  constructor(private readonly client: Client) {}

  async get(userId: string, vehicleType: VehicleType = 'motorcycle'): Promise<SearchRange | null> {
    const result = await this.client.execute({
      sql: `SELECT budget_min, budget_max, year_min, year_max
              FROM user_vehicle_search_ranges
             WHERE user_id = ? AND vehicle_type = ?`,
      args: [userId, vehicleType],
    });
    const row = result.rows[0] as unknown as RangeRow | undefined;
    if (!row) return null;
    return {
      budgetMin: row.budget_min,
      budgetMax: row.budget_max,
      yearMin: row.year_min,
      yearMax: row.year_max,
    };
  }

  async save(
    userId: string,
    range: SearchRange,
    vehicleType: VehicleType = 'motorcycle',
  ): Promise<void> {
    await this.client.execute({
      sql: UPSERT_SQL,
      args: [userId, vehicleType, range.budgetMin, range.budgetMax, range.yearMin, range.yearMax],
    });
  }
}
