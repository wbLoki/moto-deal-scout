import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlSettingsRepository } from '../../src/infrastructure/persistence/libsql/LibsqlSettingsRepository.js';

describe('LibsqlSettingsRepository', () => {
  let db: Client;
  let repo: LibsqlSettingsRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    repo = new LibsqlSettingsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns null before any range has been saved', async () => {
    await expect(repo.getSearchRange()).resolves.toBeNull();
  });

  it('persists and reads back a saved range', async () => {
    const range = { budgetMin: 20000, budgetMax: 90000, yearMin: 2018, yearMax: 2024 };
    await repo.saveSearchRange(range);
    await expect(repo.getSearchRange()).resolves.toEqual(range);
  });

  it('overwrites the previous range on repeated saves (single row)', async () => {
    await repo.saveSearchRange({ budgetMin: 0, budgetMax: 50000, yearMin: 2015, yearMax: 2020 });
    await repo.saveSearchRange({
      budgetMin: 30000,
      budgetMax: 80000,
      yearMin: 2019,
      yearMax: 2025,
    });

    const range = await repo.getSearchRange();
    expect(range).toEqual({ budgetMin: 30000, budgetMax: 80000, yearMin: 2019, yearMax: 2025 });

    const count = await db.execute('SELECT COUNT(*) AS n FROM search_settings');
    expect(count.rows[0]?.['n']).toBe(1);
  });
});
