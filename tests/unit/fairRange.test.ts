import { describe, expect, it } from 'vitest';
import { computeFairRange } from '../../src/domain/services/fairRange.js';

describe('computeFairRange', () => {
  it('returns null below the minimum sample count', () => {
    expect(computeFairRange([50000, 60000], { minSamples: 5 })).toBeNull();
  });

  it('computes a rounded p25–p75 band from prices', () => {
    // Prices 50k..90k in 5k steps (9 samples). p25≈60k, p75≈80k.
    const prices = [50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000, 90000];
    const range = computeFairRange(prices);
    expect(range).not.toBeNull();
    expect(range?.samples).toBe(9);
    expect(range?.min).toBe(60000);
    expect(range?.max).toBe(80000);
  });

  it('is robust to a few outliers (percentile-based)', () => {
    const prices = [8000, 60000, 62000, 64000, 66000, 68000, 70000, 250000];
    const range = computeFairRange(prices);
    // The 8000 typo and 250000 outlier shouldn't blow up the band.
    expect(range!.min).toBeGreaterThan(50000);
    expect(range!.max).toBeLessThan(90000);
  });

  it('drops non-positive/invalid prices before computing', () => {
    const prices = [0, -5, NaN, 60000, 62000, 64000, 66000, 68000];
    const range = computeFairRange(prices, { minSamples: 5 });
    expect(range?.samples).toBe(5);
  });

  it('keeps a non-degenerate band when all prices are equal', () => {
    const range = computeFairRange([60000, 60000, 60000, 60000, 60000], { roundTo: 500 });
    expect(range!.max).toBeGreaterThan(range!.min);
  });

  it('respects custom quantiles and rounding', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 50000 + i * 1000);
    const range = computeFairRange(prices, { lowQuantile: 0.1, highQuantile: 0.9, roundTo: 1000 });
    expect(range!.min % 1000).toBe(0);
    expect(range!.max % 1000).toBe(0);
    expect(range!.min).toBeLessThan(range!.max);
  });
});
