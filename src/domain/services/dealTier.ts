export type DealTierLevel = 'hot' | 'great' | 'good' | 'okay' | 'bad' | 'calibrating';

/** A score-based tier level, i.e. every level except the calibration state. */
export type ScoredTierLevel = Exclude<DealTierLevel, 'calibrating'>;

export interface DealTier {
  readonly level: DealTierLevel;
  readonly label: string;
}

/**
 * The score cutoffs behind {@link dealTier}, high band first. This is the one
 * place the thresholds live: the label logic below and the dashboard's
 * server-side rating filter (which turns a tier level into a `score_total`
 * range in SQL) both read from it, so a label and its filter can never drift.
 * Thresholds are chosen so the old good-deal bar (~70) lands around "Very good
 * deal". `minScore` is inclusive; the upper bound is the previous band's floor.
 */
export const TIER_BOUNDS: readonly { level: ScoredTierLevel; label: string; minScore: number }[] = [
  { level: 'hot', label: 'Hot deal', minScore: 85 },
  { level: 'great', label: 'Very good deal', minScore: 72 },
  { level: 'good', label: 'Good deal', minScore: 58 },
  { level: 'okay', label: 'Okay', minScore: 42 },
  { level: 'bad', label: 'Bad deal', minScore: 0 },
];

/**
 * The `[min, maxExclusive)` score band for a tier level, or undefined for a
 * level that isn't score-based (i.e. `calibrating`). `maxExclusive` is
 * `Infinity` for the top band. Used to build the rating filter's SQL.
 */
export function tierScoreBand(level: string): { min: number; maxExclusive: number } | undefined {
  const idx = TIER_BOUNDS.findIndex((b) => b.level === level);
  if (idx === -1) return undefined;
  return {
    min: TIER_BOUNDS[idx]!.minScore,
    maxExclusive: idx === 0 ? Infinity : TIER_BOUNDS[idx - 1]!.minScore,
  };
}

/**
 * Maps a 0-100 deal score to a human label + level, so cards can show
 * "Hot deal" / "Good deal" / … instead of a bare number.
 */
export function dealTier(score: number): DealTier {
  const bound = TIER_BOUNDS.find((b) => score >= b.minScore) ?? TIER_BOUNDS[TIER_BOUNDS.length - 1]!;
  return { level: bound.level, label: bound.label };
}

/**
 * Same as {@link dealTier}, but reports a newly-discovered model as
 * "Calibrating" instead of rating it. Until enough recent listings exist to
 * derive a fair price range, the score is missing its largest factor, so any
 * rating we showed would be noise dressed up as a verdict.
 */
export function dealTierFor(score: number, calibrated: boolean): DealTier {
  return calibrated ? dealTier(score) : { level: 'calibrating', label: 'Calibrating' };
}
