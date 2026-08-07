import { describe, expect, it } from 'vitest';
import { dealTier, tierScoreBand } from '../../src/domain/services/dealTier.js';

describe('dealTier', () => {
  it('labels the score bands', () => {
    expect(dealTier(92).label).toBe('Hot deal');
    expect(dealTier(85).level).toBe('hot');
    expect(dealTier(78).label).toBe('Very good deal');
    expect(dealTier(72).level).toBe('great');
    expect(dealTier(65).label).toBe('Good deal');
    expect(dealTier(58).level).toBe('good');
    expect(dealTier(50).label).toBe('Okay');
    expect(dealTier(42).level).toBe('okay');
    expect(dealTier(30).label).toBe('Bad deal');
    expect(dealTier(0).level).toBe('bad');
  });

  it('is monotonic across the boundaries', () => {
    const order = ['bad', 'okay', 'good', 'great', 'hot'];
    let lastIndex = -1;
    for (const score of [10, 42, 58, 72, 85, 100]) {
      const idx = order.indexOf(dealTier(score).level);
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
  });
});

describe('tierScoreBand', () => {
  it('exposes score bands that agree with the labels (used by the SQL rating filter)', () => {
    expect(tierScoreBand('hot')).toEqual({ min: 85, maxExclusive: Infinity });
    expect(tierScoreBand('great')).toEqual({ min: 72, maxExclusive: 85 });
    expect(tierScoreBand('good')).toEqual({ min: 58, maxExclusive: 72 });
    expect(tierScoreBand('okay')).toEqual({ min: 42, maxExclusive: 58 });
    expect(tierScoreBand('bad')).toEqual({ min: 0, maxExclusive: 42 });
  });

  it('has no band for the calibrating state (it is not score-based)', () => {
    expect(tierScoreBand('calibrating')).toBeUndefined();
    expect(tierScoreBand('nonsense')).toBeUndefined();
  });

  it('covers every scored value with exactly one band', () => {
    for (const score of [0, 41, 42, 57, 58, 71, 72, 84, 85, 100]) {
      const level = dealTier(score).level;
      const band = tierScoreBand(level);
      expect(band).toBeDefined();
      expect(score).toBeGreaterThanOrEqual(band!.min);
      expect(score).toBeLessThan(band!.maxExclusive);
    }
  });
});
