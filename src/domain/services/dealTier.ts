export type DealTierLevel = 'hot' | 'great' | 'good' | 'okay' | 'bad' | 'calibrating';

export interface DealTier {
  readonly level: DealTierLevel;
  readonly label: string;
}

/**
 * Maps a 0-100 deal score to a human label + level, so cards can show
 * "Hot deal" / "Good deal" / … instead of a bare number. Thresholds are
 * chosen so the old good-deal bar (~70) lands around "Very good deal".
 */
export function dealTier(score: number): DealTier {
  if (score >= 85) return { level: 'hot', label: 'Hot deal' };
  if (score >= 72) return { level: 'great', label: 'Very good deal' };
  if (score >= 58) return { level: 'good', label: 'Good deal' };
  if (score >= 42) return { level: 'okay', label: 'Okay' };
  return { level: 'bad', label: 'Bad deal' };
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
