import type { Client } from '@libsql/client';
import type { StoredModel } from '../../../domain/entities/Model.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';
import type { ModelRepository } from '../../../domain/interfaces/ModelRepository.js';

interface ModelRow {
  id: string;
  brand: string;
  model: string;
  aliases: string;
  price_min: number;
  price_max: number;
  max_mileage_km: number;
  min_year: number;
  enabled: number;
  auto_calibrate: number;
  calibrated_at: string | null;
  calibrated_samples: number | null;
  discovered_at: string | null;
}

function mapRow(row: ModelRow): StoredModel {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    aliases: JSON.parse(row.aliases) as string[],
    priceRangeMAD: { min: row.price_min, max: row.price_max },
    maxMileageKm: row.max_mileage_km,
    minYear: row.min_year,
    enabled: row.enabled === 1,
    autoCalibrate: row.auto_calibrate === 1,
    calibratedAt: row.calibrated_at ?? undefined,
    calibratedSamples: row.calibrated_samples ?? undefined,
    discoveredAt: row.discovered_at ?? undefined,
  };
}

// Admin fields only. calibrated_at/calibrated_samples are owned by
// applyCalibration and deliberately preserved across an admin edit.
const UPSERT_SQL = `
  INSERT INTO models (id, brand, model, aliases, price_min, price_max, max_mileage_km, min_year, enabled, auto_calibrate)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET
    brand = excluded.brand,
    model = excluded.model,
    aliases = excluded.aliases,
    price_min = excluded.price_min,
    price_max = excluded.price_max,
    max_mileage_km = excluded.max_mileage_km,
    min_year = excluded.min_year,
    enabled = excluded.enabled,
    auto_calibrate = excluded.auto_calibrate
`;

export class LibsqlModelRepository implements ModelRepository {
  constructor(private readonly client: Client) {}

  async listEnabledCriteria(): Promise<ModelCriteria[]> {
    const all = await this.listAll();
    return all
      .filter((m) => m.enabled)
      .map(
        ({
          enabled: _enabled,
          autoCalibrate: _auto,
          calibratedAt: _at,
          calibratedSamples: _n,
          ...criteria
        }) => criteria,
      );
  }

  async listAll(): Promise<StoredModel[]> {
    const result = await this.client.execute('SELECT * FROM models ORDER BY brand, model');
    return (result.rows as unknown as ModelRow[]).map(mapRow);
  }

  async upsert(model: StoredModel): Promise<void> {
    await this.client.execute({
      sql: UPSERT_SQL,
      args: [
        model.id,
        model.brand,
        model.model,
        JSON.stringify(model.aliases),
        model.priceRangeMAD.min,
        model.priceRangeMAD.max,
        model.maxMileageKm,
        model.minYear,
        model.enabled ? 1 : 0,
        model.autoCalibrate ? 1 : 0,
      ],
    });
  }

  async insertIfAbsent(model: StoredModel): Promise<boolean> {
    const result = await this.client.execute({
      sql: `INSERT INTO models
              (id, brand, model, aliases, price_min, price_max, max_mileage_km, min_year,
               enabled, auto_calibrate, discovered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            ON CONFLICT (id) DO NOTHING`,
      args: [
        model.id,
        model.brand,
        model.model,
        JSON.stringify(model.aliases),
        model.priceRangeMAD.min,
        model.priceRangeMAD.max,
        model.maxMileageKm,
        model.minYear,
        model.enabled ? 1 : 0,
        model.autoCalibrate ? 1 : 0,
      ],
    });
    return result.rowsAffected > 0;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE models SET enabled = ? WHERE id = ?',
      args: [enabled ? 1 : 0, id],
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM models WHERE id = ?', args: [id] });
  }

  async applyCalibration(id: string, min: number, max: number, samples: number): Promise<void> {
    await this.client.execute({
      sql: `UPDATE models
               SET price_min = ?, price_max = ?, calibrated_samples = ?,
                   calibrated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ? AND auto_calibrate = 1`,
      args: [min, max, samples, id],
    });
  }

  async seedIfEmpty(models: readonly ModelCriteria[]): Promise<void> {
    const existing = await this.client.execute('SELECT COUNT(*) AS n FROM models');
    const count = Number((existing.rows[0] as unknown as { n: number }).n);
    if (count > 0) return;
    for (const m of models) {
      await this.upsert({ ...m, enabled: true, autoCalibrate: true });
    }
  }
}
