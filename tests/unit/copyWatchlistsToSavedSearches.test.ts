import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  copyWatchlistsToSavedSearches,
  openDatabase,
} from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from '../../src/infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlSavedSearchRepository } from '../../src/infrastructure/persistence/libsql/LibsqlSavedSearchRepository.js';
import { LibsqlUserProfileRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserRepository.js';
import { makeModelCriteria } from '../fixtures/sampleData.js';

describe('copyWatchlistsToSavedSearches', () => {
  let db: Client;
  let userId: string;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    userId = (
      await new LibsqlUserRepository(db).create({
        email: 'u@x.com',
        name: undefined,
        passwordHash: 'h',
        role: 'user',
      })
    ).id;
    await new LibsqlModelRepository(db).upsert({
      ...makeModelCriteria({
        id: 'dacia-logan',
        brand: 'Dacia',
        model: 'Logan',
        vehicleType: 'car',
      }),
      enabled: true,
      autoCalibrate: true,
    });
    await new LibsqlUserProfileRepository(db).addWatchedModel(userId, 'dacia-logan');
    // Opening the DB already recorded the one-shot flag (with no users yet).
    await db.execute("DELETE FROM schema_data_migrations WHERE id = 'copy_watchlists_to_saved_searches'");
  });

  afterEach(() => {
    db.close();
  });

  it('converts leftover car watches into a Cars saved search on a fresh database', async () => {
    await copyWatchlistsToSavedSearches(db);
    const searches = await new LibsqlSavedSearchRepository(db).listForUser(userId, 'car');
    expect(searches).toHaveLength(1);
    expect(searches[0]?.name).toBe('Cars');
    expect(searches[0]?.modelIds).toEqual(['dacia-logan']);
  });

  it('does not revive a deleted Cars search on a later scan', async () => {
    await copyWatchlistsToSavedSearches(db);
    await db.execute({
      sql: 'DELETE FROM user_saved_searches WHERE user_id = ?',
      args: [userId],
    });

    await copyWatchlistsToSavedSearches(db);

    const searches = await new LibsqlSavedSearchRepository(db).listForUser(userId, 'car');
    expect(searches).toEqual([]);
  });

  it('does not copy on a database that already has listings (already scanned)', async () => {
    await db.execute(`
      INSERT INTO listings (
        source_id, external_id, url, title, price_mad, city, scraped_at,
        matched_model_id, match_confidence, score_price, score_mileage, score_year,
        score_city, score_total, score_reasons, is_good_deal
      ) VALUES (
        'avito', '1', 'https://example.com/1', 'Dacia Logan', 80000, 'Casablanca',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'dacia-logan', 0.9, 0, 0, 0, 0, 0, '[]', 0
      )
    `);

    await copyWatchlistsToSavedSearches(db);

    const searches = await new LibsqlSavedSearchRepository(db).listForUser(userId, 'car');
    expect(searches).toEqual([]);
  });
});
