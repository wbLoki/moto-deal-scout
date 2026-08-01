import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultCriteria } from '../../src/config/defaultCriteria.js';
import { loadCriteria } from '../../src/config/loadCriteria.js';
import { searchCriteriaSchema } from '../../src/config/criteriaSchema.js';

describe('defaultCriteria', () => {
  it('is valid against the criteria schema', () => {
    expect(() => searchCriteriaSchema.parse(defaultCriteria)).not.toThrow();
  });
});

describe('loadCriteria', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('returns the built-in default when no override path is given', async () => {
    const criteria = await loadCriteria(undefined);
    expect(criteria.models.length).toBe(defaultCriteria.models.length);
  });

  it('loads and validates a JSON override file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'moto-deal-scout-'));
    const path = join(dir, 'criteria.json');
    const override = {
      models: [
        {
          id: 'test-model',
          brand: 'Test',
          model: 'X1',
          aliases: [],
          priceRangeMAD: { min: 1000, max: 2000 },
          maxMileageKm: 10000,
          minYear: 2020,
        },
      ],
      global: {
        preferredCities: ['Rabat'],
        acceptableCities: [],
        minScoreForGoodDeal: 80,
        maxListingAgeDays: 7,
        minModelMatchConfidence: 0.6,
      },
    };
    writeFileSync(path, JSON.stringify(override));

    const criteria = await loadCriteria(path);

    expect(criteria.models).toHaveLength(1);
    expect(criteria.models[0]?.id).toBe('test-model');
    expect(criteria.global.minScoreForGoodDeal).toBe(80);
  });

  it('throws a readable error for a malformed override file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'moto-deal-scout-'));
    const path = join(dir, 'bad-criteria.json');
    writeFileSync(path, JSON.stringify({ models: [], global: {} }));

    await expect(loadCriteria(path)).rejects.toThrow(/Invalid criteria config/);
  });
});
