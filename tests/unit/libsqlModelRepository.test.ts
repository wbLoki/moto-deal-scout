import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelCriteria } from '../../src/domain/entities/SearchCriteria.js';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from '../../src/infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { makeModelCriteria } from '../fixtures/sampleData.js';

describe('LibsqlModelRepository', () => {
  let db: Client;
  let repo: LibsqlModelRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    repo = new LibsqlModelRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('seeds from config only when empty', async () => {
    const seed: ModelCriteria[] = [
      makeModelCriteria({ id: 'm1' }),
      makeModelCriteria({ id: 'm2' }),
    ];
    await repo.seedIfEmpty(seed);
    await repo.seedIfEmpty([makeModelCriteria({ id: 'm3' })]); // ignored, table not empty
    const all = await repo.listAll();
    expect(all.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('lists only enabled models as criteria (dropping the enabled flag)', async () => {
    await repo.upsert({ ...makeModelCriteria({ id: 'on' }), enabled: true });
    await repo.upsert({ ...makeModelCriteria({ id: 'off' }), enabled: false });
    const criteria = await repo.listEnabledCriteria();
    expect(criteria).toHaveLength(1);
    expect(criteria[0]?.id).toBe('on');
    expect('enabled' in (criteria[0] as object)).toBe(false);
  });

  it('upsert updates an existing model in place', async () => {
    await repo.upsert({ ...makeModelCriteria({ id: 'x' }), enabled: true });
    await repo.upsert({
      ...makeModelCriteria({ id: 'x', priceRangeMAD: { min: 1, max: 2 } }),
      enabled: true,
    });
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.priceRangeMAD).toEqual({ min: 1, max: 2 });
  });

  it('setEnabled toggles and delete removes', async () => {
    await repo.upsert({ ...makeModelCriteria({ id: 'y' }), enabled: true });
    await repo.setEnabled('y', false);
    expect((await repo.listAll())[0]?.enabled).toBe(false);
    await repo.delete('y');
    expect(await repo.listAll()).toHaveLength(0);
  });
});
