import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlUserRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserRepository.js';
import { LibsqlSavedSearchRepository } from '../../src/infrastructure/persistence/libsql/LibsqlSavedSearchRepository.js';
import { LibsqlUserSearchRangeRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';

describe('per-vehicle-type isolation', () => {
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
  });

  afterEach(() => {
    db.close();
  });

  it('saving a car search range does not overwrite the motorcycle range', async () => {
    const ranges = new LibsqlUserSearchRangeRepository(db);
    await ranges.save(userId, { budgetMin: 0, budgetMax: 200000, yearMin: 2018, yearMax: 2026 }, 'motorcycle');
    await ranges.save(userId, { budgetMin: 0, budgetMax: 600000, yearMin: 2010, yearMax: 2026 }, 'car');

    expect(await ranges.get(userId, 'motorcycle')).toMatchObject({ budgetMax: 200000, yearMin: 2018 });
    expect(await ranges.get(userId, 'car')).toMatchObject({ budgetMax: 600000, yearMin: 2010 });
  });

  it('a car saved search does not match motorcycle listings in the repository', async () => {
    const searches = new LibsqlSavedSearchRepository(db);
    await searches.insert({
      id: 'car-s',
      userId,
      name: 'Cars',
      vehicleType: 'car',
      budgetMin: 0,
      budgetMax: 600000,
      yearMin: 2010,
      yearMax: 2026,
      mileageMax: 0,
      brands: [],
      cities: [],
      fuelTypes: [],
      gearboxes: [],
      modelIds: [],
    });
    const listed = await searches.listForUser(userId, 'motorcycle');
    expect(listed).toEqual([]);
    expect(await searches.listForUser(userId, 'car')).toHaveLength(1);
  });
});
