import type { Client, Row } from '@libsql/client';
import type { Logger } from 'pino';
import type { ScoredListing } from '../../../domain/entities/ScoredListing.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';
import type { SavedListingRepository } from '../../../domain/interfaces/SavedListingRepository.js';
import { mapRowToScoredListing, type ListingRow } from './schema.js';

/**
 * libsql-backed {@link SavedListingRepository}. `listSavedDeals` joins the
 * bookmark table back to `listings` and rebuilds each `ScoredListing`, so it
 * needs the currently-loaded models to resolve `matched_model_id` (same as the
 * listing repository).
 */
export class LibsqlSavedListingRepository implements SavedListingRepository {
  private readonly modelsById: ReadonlyMap<string, ModelCriteria>;

  constructor(
    private readonly client: Client,
    models: readonly ModelCriteria[] = [],
    private readonly logger?: Logger,
  ) {
    this.modelsById = new Map(models.map((m) => [m.id, m]));
  }

  async add(userId: string, sourceId: string, externalId: string): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO user_saved_listings (user_id, source_id, external_id)
            VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      args: [userId, sourceId, externalId],
    });
  }

  async remove(userId: string, sourceId: string, externalId: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM user_saved_listings WHERE user_id = ? AND source_id = ? AND external_id = ?',
      args: [userId, sourceId, externalId],
    });
  }

  async listSavedKeys(userId: string): Promise<string[]> {
    const result = await this.client.execute({
      sql: 'SELECT source_id, external_id FROM user_saved_listings WHERE user_id = ?',
      args: [userId],
    });
    return (result.rows as unknown as { source_id: string; external_id: string }[]).map(
      (r) => `${r.source_id}:${r.external_id}`,
    );
  }

  async listSavedDeals(userId: string): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: `SELECT l.* FROM user_saved_listings s
            JOIN listings l ON l.source_id = s.source_id AND l.external_id = s.external_id
            WHERE s.user_id = ?
            ORDER BY s.saved_at DESC`,
      args: [userId],
    });
    return this.mapRows(result.rows);
  }

  private mapRows(rows: readonly Row[]): ScoredListing[] {
    const results: ScoredListing[] = [];
    for (const row of rows) {
      const scored = mapRowToScoredListing(
        row as unknown as ListingRow,
        this.modelsById,
        this.logger,
      );
      if (scored) results.push(scored);
    }
    return results;
  }
}
