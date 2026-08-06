import { describe, expect, it } from 'vitest';
import { isCalibrated } from '../../src/domain/services/calibrationState.js';
import { computeFairRange } from '../../src/domain/services/fairRange.js';
import { PROVISIONAL_PRICE_RANGE } from '../../src/domain/services/provisionalModel.js';

describe('isCalibrated', () => {
  it('treats the provisional range as not calibrated', () => {
    expect(isCalibrated({ priceRangeMAD: PROVISIONAL_PRICE_RANGE })).toBe(false);
  });

  it('treats any real range as calibrated', () => {
    expect(isCalibrated({ priceRangeMAD: { min: 65000, max: 95000 } })).toBe(true);
  });

  it('computeFairRange can never produce the provisional sentinel', () => {
    // The whole "no extra column needed" design rests on this: if calibration
    // could ever emit min = 0, a calibrated model would look uncalibrated.
    const samples = [
      [1, 1, 1, 1, 1],
      [0.5, 1, 2, 3, 4],
      [100, 200, 300, 400, 500],
      Array.from({ length: 40 }, (_, i) => i + 1),
    ];
    for (const prices of samples) {
      const range = computeFairRange(prices);
      expect(range).not.toBeNull();
      expect(range!.min).toBeGreaterThan(0);
      expect(range!.max).toBeGreaterThan(range!.min);
    }
  });
});
