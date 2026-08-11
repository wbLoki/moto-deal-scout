import type { ModelCriteria } from '../../domain/entities/SearchCriteria.js';
import type { ScoreBreakdown } from '../../domain/entities/ScoredListing.js';
import { TIER_BOUNDS, type ScoredTierLevel } from '../../domain/services/dealTier.js';
import { PRICE_WEIGHT, priceForScore } from './ListingScorer.js';

/** Round suggested prices down to this step (matches calibration's granularity). */
const ROUND_STEP = 500;
const floorTo = (value: number, step: number): number => Math.floor(value / step) * step;

function tierBound(level: ScoredTierLevel): { label: string; minScore: number } {
  const bound = TIER_BOUNDS.find((b) => b.level === level);
  // SUGGEST_LEVELS only names levels that exist in TIER_BOUNDS.
  return { label: bound!.label, minScore: bound!.minScore };
}

/** A price ceiling for reaching one deal tier, given the bike's non-price factors. */
export interface PriceTarget {
  readonly level: ScoredTierLevel;
  readonly label: string;
  readonly targetScore: number;
  /** False when even a giveaway price can't reach the tier (mileage/age hold it back). */
  readonly reachable: boolean;
  /** Highest asking price that still reaches this tier, or null when unreachable. */
  readonly maxPrice: number | null;
}

/** The fair market range plus the price ceilings for the "good" and "great" tiers. */
export interface PriceSuggestion {
  readonly fairMin: number;
  readonly fairMax: number;
  /** Ordered: the "very good deal" ceiling first, then the "hot deal" ceiling. */
  readonly targets: readonly PriceTarget[];
}

/** Tiers we advise toward: a solid buy, then a steal. */
const SUGGEST_LEVELS: readonly ScoredTierLevel[] = ['great', 'hot'];

/**
 * Given a scored breakdown for a bike, works out the asking price that would
 * make it a "very good" / "hot" deal — by inverting the price factor while
 * holding the mileage/year/city sub-scores fixed. The price sub-score is
 * ignored, so the same suggestion holds whether or not an asking price was
 * entered. Assumes `model` is calibrated (caller checks).
 */
export function suggestPrice(model: ModelCriteria, breakdown: ScoreBreakdown): PriceSuggestion {
  const otherPoints = breakdown.mileage + breakdown.year + breakdown.city;
  const targets = SUGGEST_LEVELS.map((level): PriceTarget => {
    const { label, minScore } = tierBound(level);
    const neededPricePoints = minScore - otherPoints;
    // Even a price of 0 earns at most PRICE_WEIGHT points; beyond that the tier
    // is out of reach at any price.
    const reachable = neededPricePoints <= PRICE_WEIGHT;
    const maxPrice = reachable ? floorTo(priceForScore(neededPricePoints, model), ROUND_STEP) : null;
    return { level, label, targetScore: minScore, reachable, maxPrice };
  });
  return { fairMin: model.priceRangeMAD.min, fairMax: model.priceRangeMAD.max, targets };
}
