import { describe, expect, it } from 'vitest';
import { dealTier } from '../../src/domain/services/dealTier.js';

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
