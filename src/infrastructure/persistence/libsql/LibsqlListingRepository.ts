import type { Client, Row } from '@libsql/client';
import type { Logger } from 'pino';
import type { MarketplaceId } from '../../../domain/entities/Listing.js';
import type { ScoredListing } from '../../../domain/entities/ScoredListing.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';
import type { ListingRepository } from '../../../domain/interfaces/ListingRepository.js';
import { mapRowToScoredListing, toInsertArgs, UPSERT_SQL, type ListingRow } from './schema.js';

/**
 * libsql-backed {@link ListingRepository}. Works unchanged against a local
 * SQLite file (CLI, tests) or a remote Turso database (Vercel) — the
 * difference lives entirely in how the {@link Client} was created.
 *
 * `models` must be the currently-loaded criteria's model list; it resolves
 * the persisted `matched_model_id` back into a full `ModelCriteria` on read.
 */
export class LibsqlListingRepository implements ListingRepository {
  private readonly modelsById: ReadonlyMap<string, ModelCriteria>;

  constructor(
    private readonly client: Client,
    models: readonly ModelCriteria[],
    private readonly logger?: Logger,
  ) {
    this.modelsById = new Map(models.map((m) => [m.id, m]));
  }

  async hasSeen(sourceId: MarketplaceId, externalId: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: 'SELECT 1 FROM listings WHERE source_id = ? AND external_id = ? LIMIT 1',
      args: [sourceId, externalId],
    });
    return result.rows.length > 0;
  }

  async save(scored: ScoredListing): Promise<void> {
    await this.client.execute({ sql: UPSERT_SQL, args: toInsertArgs(scored) });
  }

  async getGoodDealsSince(sinceDate: Date): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings WHERE is_good_deal = 1 AND created_at >= ? ORDER BY created_at DESC',
      args: [sinceDate.toISOString()],
    });
    return this.mapRows(result.rows);
  }

  async getRecentGoodDeals(limit: number): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings WHERE is_good_deal = 1 ORDER BY created_at DESC LIMIT ?',
      args: [limit],
    });
    return this.mapRows(result.rows);
  }

  close(): Promise<void> {
    this.client.close();
    return Promise.resolve();
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
