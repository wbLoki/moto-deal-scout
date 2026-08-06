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

  it('insertIfAbsent creates a model once and reports whether it did', async () => {
    const model = { ...makeModelCriteria({ id: 'new' }), enabled: true, autoCalibrate: true };
    expect(await repo.insertIfAbsent(model)).toBe(true);
    expect(await repo.insertIfAbsent(model)).toBe(false);
    expect(await repo.listAll()).toHaveLength(1);
  });

  it('insertIfAbsent never overwrites a calibrated price range', async () => {
    // The regression this guards: discovery re-sees an already-known model on
    // every weekly crawl. If it used upsert, each crawl would reset the fair
    // range back to the provisional one and undo all calibration.
    const provisional = {
      ...makeModelCriteria({ id: 'yamaha-mt07', priceRangeMAD: { min: 0, max: 300000 } }),
      enabled: true,
      autoCalibrate: true,
    };
    await repo.insertIfAbsent(provisional);
    await repo.applyCalibration('yamaha-mt07', 65000, 95000, 12);

    expect(await repo.insertIfAbsent(provisional)).toBe(false);

    const stored = (await repo.listAll())[0];
    expect(stored?.priceRangeMAD).toEqual({ min: 65000, max: 95000 });
    expect(stored?.calibratedSamples).toBe(12);
  });

  it('records discovered_at for discovered models but not admin-created ones', async () => {
    await repo.insertIfAbsent({
      ...makeModelCriteria({ id: 'found' }),
      enabled: true,
      autoCalibrate: true,
    });
    await repo.upsert({ ...makeModelCriteria({ id: 'manual' }), enabled: true, autoCalibrate: true });

    const byId = new Map((await repo.listAll()).map((m) => [m.id, m]));
    expect(byId.get('found')?.discoveredAt).toBeTypeOf('string');
    expect(byId.get('manual')?.discoveredAt).toBeUndefined();
  });

  it('lists only enabled models as criteria (dropping the enabled flag)', async () => {
    await repo.upsert({ ...makeModelCriteria({ id: 'on' }), enabled: true, autoCalibrate: true });
    await repo.upsert({ ...makeModelCriteria({ id: 'off' }), enabled: false, autoCalibrate: true });
    const criteria = await repo.listEnabledCriteria();
    expect(criteria).toHaveLength(1);
    expect(criteria[0]?.id).toBe('on');
    expect('enabled' in (criteria[0] as object)).toBe(false);
  });

  it('upsert updates an existing model in place', async () => {
    await repo.upsert({ ...makeModelCriteria({ id: 'x' }), enabled: true, autoCalibrate: true });
    await repo.upsert({
      ...makeModelCriteria({ id: 'x', priceRangeMAD: { min: 1, max: 2 } }),
      enabled: true,
      autoCalibrate: true,
    });
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.priceRangeMAD).toEqual({ min: 1, max: 2 });
  });

  it('setEnabled toggles and delete removes', async () => {
    await repo.upsert({ ...makeModelCriteria({ id: 'y' }), enabled: true, autoCalibrate: true });
    await repo.setEnabled('y', false);
    expect((await repo.listAll())[0]?.enabled).toBe(false);
    await repo.delete('y');
    expect(await repo.listAll()).toHaveLength(0);
  });

  it('applyCalibration overwrites the range only when auto-calibrate is on', async () => {
    await repo.upsert({
      ...makeModelCriteria({ id: 'auto', priceRangeMAD: { min: 10, max: 20 } }),
      enabled: true,
      autoCalibrate: true,
    });
    await repo.upsert({
      ...makeModelCriteria({ id: 'manual', priceRangeMAD: { min: 10, max: 20 } }),
      enabled: true,
      autoCalibrate: false,
    });

    await repo.applyCalibration('auto', 5000, 9000, 42);
    await repo.applyCalibration('manual', 5000, 9000, 42);

    const byId = new Map((await repo.listAll()).map((m) => [m.id, m]));
    const auto = byId.get('auto')!;
    const manual = byId.get('manual')!;

    expect(auto.priceRangeMAD).toEqual({ min: 5000, max: 9000 });
    expect(auto.calibratedSamples).toBe(42);
    expect(auto.calibratedAt).toBeTruthy();

    // manual override is untouched
    expect(manual.priceRangeMAD).toEqual({ min: 10, max: 20 });
    expect(manual.calibratedAt).toBeUndefined();
  });
});
