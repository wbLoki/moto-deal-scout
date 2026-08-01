import type { Client } from '@libsql/client';
import type { SearchRange } from '../../../domain/entities/SearchCriteria.js';
import type { SettingsRepository } from '../../../domain/interfaces/SettingsRepository.js';

interface SettingsRow {
  budget_min: number;
  budget_max: number;
  year_min: number;
  year_max: number;
}

const UPSERT_SQL = `
  INSERT INTO search_settings (id, budget_min, budget_max, year_min, year_max, updated_at)
  VALUES (1, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT (id) DO UPDATE SET
    budget_min = excluded.budget_min,
    budget_max = excluded.budget_max,
    year_min = excluded.year_min,
    year_max = excluded.year_max,
    updated_at = excluded.updated_at
`;

/** libsql-backed {@link SettingsRepository}; stores the search range as a single pinned row. */
export class LibsqlSettingsRepository implements SettingsRepository {
  constructor(private readonly client: Client) {}

  async getSearchRange(): Promise<SearchRange | null> {
    const result = await this.client.execute('SELECT * FROM search_settings WHERE id = 1');
    const row = result.rows[0] as unknown as SettingsRow | undefined;
    if (!row) return null;
    return {
      budgetMin: row.budget_min,
      budgetMax: row.budget_max,
      yearMin: row.year_min,
      yearMax: row.year_max,
    };
  }

  async saveSearchRange(range: SearchRange): Promise<void> {
    await this.client.execute({
      sql: UPSERT_SQL,
      args: [range.budgetMin, range.budgetMax, range.yearMin, range.yearMax],
    });
  }
}
