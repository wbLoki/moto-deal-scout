import { describe, expect, it } from 'vitest';
import type { ScoreBreakdown } from '../../src/domain/entities/ScoredListing.js';
import {
  fairPriceBounds,
  priceForScore,
  scorePriceValue,
} from '../../src/application/services/ListingScorer.js';
import { suggestPrice } from '../../src/application/services/priceAdvisor.js';
import { makeModelCriteria } from '../fixtures/sampleData.js';

// fair range 65 000–95 000 => goodAt 65 000, badAt 114 000.
const model = makeModelCriteria({ priceRangeMAD: { min: 65000, max: 95000 } });

function breakdown(over: Partial<ScoreBreakdown>): ScoreBreakdown {
  return { price: 0, mileage: 0, year: 0, city: 0, total: 0, reasons: [], ...over };
}

describe('price factor forward/inverse', () => {
  it('anchors at the fair min (full marks) and 1.2× max (zero)', () => {
    const { goodAt, badAt } = fairPriceBounds(model);
    expect(goodAt).toBe(65000);
    expect(badAt).toBe(114000);
    expect(priceForScore(40, model)).toBe(goodAt);
    expect(priceForScore(0, model)).toBe(badAt);
  });

  it('round-trips a mid-band price through score and back', () => {
    const price = 89500; // midpoint of 65 000..114 000
    expect(scorePriceValue(price, model)).toBe(20);
    expect(priceForScore(20, model)).toBe(price);
  });

  it('clamps points outside [0, PRICE_WEIGHT]', () => {
    expect(priceForScore(-5, model)).toBe(114000);
    expect(priceForScore(999, model)).toBe(65000);
  });
});

describe('suggestPrice', () => {
  it('returns reachable ceilings for good non-price factors', () => {
    // mileage 25 + year 20 + city 15 = 60 other points.
    const s = suggestPrice(model, breakdown({ mileage: 25, year: 20, city: 15 }));
    expect(s.fairMin).toBe(65000);
    expect(s.fairMax).toBe(95000);

    const great = s.targets.find((t) => t.level === 'great')!;
    const hot = s.targets.find((t) => t.level === 'hot')!;
    expect(great.reachable).toBe(true);
    expect(hot.reachable).toBe(true);
    // Cheaper price required for the higher tier.
    expect(hot.maxPrice!).toBeLessThan(great.maxPrice!);
    // Rounded down to the 500 step.
    expect(great.maxPrice! % 500).toBe(0);
  });

  it('marks a tier unreachable when mileage/age already sink the score', () => {
    // 0 other points: even a free bike tops out at 40 < 72.
    const s = suggestPrice(model, breakdown({ mileage: 0, year: 0, city: 0 }));
    for (const t of s.targets) {
      expect(t.reachable).toBe(false);
      expect(t.maxPrice).toBeNull();
    }
  });
});
