import { describe, expect, it } from 'vitest';
import { CatalogModelResolver } from '../../src/application/services/CatalogModelResolver.js';
import { evaluateBike } from '../../src/application/services/evaluateBike.js';
import { makeGlobalCriteria, makeModelCriteria } from '../fixtures/sampleData.js';

// Resolve real catalog ids so the fixtures line up with what evaluateBike's
// resolver produces, without hard-coding the id scheme.
const resolver = new CatalogModelResolver();
const idFor = (name: string): string => {
  const id = resolver.resolve(name)?.id;
  if (!id) throw new Error(`catalog has no entry for "${name}"`);
  return id;
};

const mt07 = makeModelCriteria({
  id: idFor('Yamaha MT-07'),
  brand: 'Yamaha',
  model: 'MT-07',
  priceRangeMAD: { min: 65000, max: 95000 },
});
// Provisional: min 0 => not calibrated yet.
const cb500f = makeModelCriteria({
  id: idFor('Honda CB500F'),
  brand: 'Honda',
  model: 'CB500F',
  priceRangeMAD: { min: 0, max: 300000 },
});
// A same-"500R" model from another maker, to prove brand isolation.
const voge500r = makeModelCriteria({
  id: idFor('Voge 500R'),
  brand: 'Voge',
  model: '500R',
  priceRangeMAD: { min: 40000, max: 60000 },
});

const ctx = { models: [mt07, cb500f, voge500r], global: makeGlobalCriteria() };

describe('evaluateBike', () => {
  it('rates a matched, calibrated bike and suggests a price', () => {
    const res = evaluateBike(
      { brand: 'Yamaha', model: 'MT-07', year: 2020, mileageKm: 10000, priceMAD: 60000, city: 'Casablanca' },
      ctx,
    );
    expect(res.status).toBe('rated');
    expect(res.matched?.brand).toBe('Yamaha');
    expect(res.rating).toBeDefined();
    expect(res.rating!.factors).toHaveLength(4);
    // 60 000 is below the fair min (65 000).
    expect(res.rating!.pricePosition).toBe('below');
    expect(res.rating!.score).toBeGreaterThan(72);
    expect(res.suggestion).toBeDefined();
  });

  it('suggests a price but omits the rating when no asking price is given', () => {
    const res = evaluateBike({ brand: 'Yamaha', model: 'MT-07', mileageKm: 10000 }, ctx);
    expect(res.status).toBe('rated');
    expect(res.rating).toBeUndefined();
    expect(res.suggestion).toBeDefined();
  });

  it('still evaluates when mileage and year are omitted', () => {
    const res = evaluateBike({ brand: 'Yamaha', model: 'MT-07', priceMAD: 70000 }, ctx);
    expect(res.status).toBe('rated');
    expect(res.rating).toBeDefined();
  });

  it('reports a matched-but-provisional model as calibrating', () => {
    const res = evaluateBike({ brand: 'Honda', model: 'CB500F', priceMAD: 50000 }, ctx);
    expect(res.status).toBe('calibrating');
    expect(res.matched?.brand).toBe('Honda');
    expect(res.rating).toBeUndefined();
    expect(res.suggestion).toBeUndefined();
  });

  it('does not cross brands: an untracked Honda never matches a Voge 500R', () => {
    // "Honda CBR500R" isn't in ctx.models; it must resolve as Honda and report
    // not-found, never fall through to the Voge 500R that shares "500R".
    const res = evaluateBike({ brand: 'Honda', model: 'CBR500R', priceMAD: 60000 }, ctx);
    expect(res.status).toBe('not-found');
    expect(res.matched).toBeUndefined();
  });

  it('returns not-found for a model we do not track', () => {
    const res = evaluateBike({ brand: 'Zonkler', model: 'Xyz999', priceMAD: 40000 }, ctx);
    expect(res.status).toBe('not-found');
    expect(res.matched).toBeUndefined();
  });
});
