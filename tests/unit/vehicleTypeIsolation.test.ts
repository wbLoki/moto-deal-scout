import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from '../../src/infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlUserProfileRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserRepository.js';
import { LibsqlUserSearchRangeRepository } from '../../src/infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { makeModelCriteria } from '../fixtures/sampleData.js';

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

  it('saving a car watchlist does not clear motorcycle watches', async () => {
    const models = new LibsqlModelRepository(db);
    await models.upsert({
      ...makeModelCriteria({ id: 'yamaha-mt07', brand: 'Yamaha', model: 'MT-07', vehicleType: 'motorcycle' }),
      enabled: true,
      autoCalibrate: true,
    });
    await models.upsert({
      ...makeModelCriteria({
        id: 'dacia-duster',
        brand: 'Dacia',
        model: 'Duster',
        vehicleType: 'car',
      }),
      enabled: true,
      autoCalibrate: true,
    });

    const profile = new LibsqlUserProfileRepository(db);
    await profile.setWatchedModelIdsForType(userId, 'motorcycle', ['yamaha-mt07']);
    await profile.setWatchedModelIdsForType(userId, 'car', ['dacia-duster']);
    await profile.setWatchedModelIdsForType(userId, 'car', []);

    expect(await profile.getWatchedModelIds(userId)).toEqual(['yamaha-mt07']);
  });
});
