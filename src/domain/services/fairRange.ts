/** Below this many data points a percentile is too noisy to trust. */
export const MIN_CALIBRATION_SAMPLES = 5;

export interface FairRange {
  readonly min: number;
  readonly max: number;
  readonly samples: number;
}

export interface FairRangeOptions {
  /** Lower percentile (0-1) → the "great price" floor. Default 0.25. */
  readonly lowQuantile?: number;
  /** Upper percentile (0-1) → the fair-value ceiling. Default 0.75. */
  readonly highQuantile?: number;
  /** Round bounds to a tidy step (MAD). Default 500. */
  readonly roundTo?: number;
  readonly minSamples?: number;
}

/** Linear-interpolated quantile of an ascending-sorted array. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

/**
 * Estimates a model's fair price band from recent market prices: the
 * lowQuantile is the "great deal" floor and highQuantile the fair ceiling.
 * Returns null when there aren't enough samples to be meaningful, so callers
 * can fall back to the admin-set range. Robust to a few outliers because it
 * uses percentiles, not min/max.
 */
export function computeFairRange(
  prices: readonly number[],
  opts: FairRangeOptions = {},
): FairRange | null {
  const lowQ = opts.lowQuantile ?? 0.25;
  const highQ = opts.highQuantile ?? 0.75;
  const roundTo = opts.roundTo ?? 500;
  const minSamples = opts.minSamples ?? MIN_CALIBRATION_SAMPLES;

  const valid = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (valid.length < minSamples) return null;

  const round = (v: number) => Math.max(roundTo, Math.round(v / roundTo) * roundTo);
  const min = round(quantile(valid, lowQ));
  let max = round(quantile(valid, highQ));
  if (max <= min) max = min + roundTo; // keep a non-degenerate band

  return { min, max, samples: valid.length };
}
