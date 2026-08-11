import type { Listing } from '../../domain/entities/Listing.js';
import type { ScoreBreakdown } from '../../domain/entities/ScoredListing.js';
import type { GlobalCriteria, ModelCriteria } from '../../domain/entities/SearchCriteria.js';
import { isCalibrated } from '../../domain/services/calibrationState.js';

/** Points available per factor. Must sum to 100. */
const WEIGHTS = {
  price: 40,
  mileage: 25,
  year: 20,
  city: 15,
} as const;

/** Points each factor contributes to the 0-100 total. Read by the compare page's breakdown bars. */
export const FACTOR_WEIGHTS = WEIGHTS;

/** Points the price factor contributes to the 0-100 total. */
export const PRICE_WEIGHT = WEIGHTS.price;

/**
 * How far above a model's fair-range max a price scores zero on price. The
 * fair range's `min` is where price scores full marks. Both the forward score
 * and its inverse read this, so a rating and a suggested price can't drift.
 */
const PRICE_OVER_FACTOR = 1.2;

/**
 * The price factor's endpoints for a model: full marks at or below `goodAt`
 * (the fair min), zero at or above `badAt` (fair max × {@link PRICE_OVER_FACTOR}).
 */
export function fairPriceBounds(model: ModelCriteria): { goodAt: number; badAt: number } {
  return { goodAt: model.priceRangeMAD.min, badAt: model.priceRangeMAD.max * PRICE_OVER_FACTOR };
}

/**
 * Linear scoring primitive for "lower is better" factors: full marks at or
 * below `goodAt`, zero at or above `badAt`, interpolated linearly between.
 */
function scoreLowerIsBetter(
  value: number,
  goodAt: number,
  badAt: number,
  maxPoints: number,
): number {
  if (value <= goodAt) return maxPoints;
  if (value >= badAt) return 0;
  return (maxPoints * (badAt - value)) / (badAt - goodAt);
}

/**
 * The price factor's 0-{@link PRICE_WEIGHT} contribution for a bare price +
 * model, without the reasons/half-marks logic. Shared by {@link scorePrice}
 * and the price advisor so both read one definition of "how price scores".
 * Assumes the model is calibrated (caller checks).
 */
export function scorePriceValue(price: number, model: ModelCriteria): number {
  const { goodAt, badAt } = fairPriceBounds(model);
  return scoreLowerIsBetter(price, goodAt, badAt, PRICE_WEIGHT);
}

/**
 * Inverse of {@link scorePriceValue}: the highest price that still earns
 * `points` on the price factor. Clamped so `points ≤ 0` returns `badAt` and
 * `points ≥ PRICE_WEIGHT` returns `goodAt` (the fair min).
 */
export function priceForScore(points: number, model: ModelCriteria): number {
  const { goodAt, badAt } = fairPriceBounds(model);
  const p = Math.max(0, Math.min(PRICE_WEIGHT, points));
  return badAt - (p / PRICE_WEIGHT) * (badAt - goodAt);
}

/** Mirror of {@link scoreLowerIsBetter} for "higher is better" factors. */
function scoreHigherIsBetter(
  value: number,
  badAt: number,
  goodAt: number,
  maxPoints: number,
): number {
  if (value >= goodAt) return maxPoints;
  if (value <= badAt) return 0;
  return (maxPoints * (value - badAt)) / (goodAt - badAt);
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

function scorePrice(listing: Listing, model: ModelCriteria, reasons: string[]): number {
  // A model we've only just discovered has no fair range yet. Scoring it
  // against the provisional 0–300 000 band would hand almost full marks to
  // every listing and manufacture fake hot deals, so award the same neutral
  // half-marks used when a listing omits its mileage or year.
  if (!isCalibrated(model)) {
    reasons.push('Fair price range not calibrated yet — scored as average.');
    return WEIGHTS.price * 0.5;
  }

  const { min, max } = model.priceRangeMAD;
  const points = scorePriceValue(listing.priceMAD, model);

  if (listing.priceMAD <= min) {
    reasons.push(`Price ${listing.priceMAD} MAD is at or below the fair range (${min}-${max}).`);
  } else if (listing.priceMAD <= max) {
    reasons.push(`Price ${listing.priceMAD} MAD is within the fair range (${min}-${max}).`);
  } else {
    const overPct = Math.round(((listing.priceMAD - max) / max) * 100);
    reasons.push(`Price ${listing.priceMAD} MAD is ${overPct}% above the fair range max (${max}).`);
  }
  return points;
}

function scoreMileage(listing: Listing, model: ModelCriteria, reasons: string[]): number {
  if (listing.mileageKm === undefined) {
    reasons.push('Mileage not listed — scored as average.');
    return WEIGHTS.mileage * 0.5;
  }
  const goodAt = model.maxMileageKm * 0.4;
  const badAt = model.maxMileageKm * 1.15;
  const points = scoreLowerIsBetter(listing.mileageKm, goodAt, badAt, WEIGHTS.mileage);

  if (listing.mileageKm > model.maxMileageKm) {
    reasons.push(`Mileage ${listing.mileageKm}km exceeds the ${model.maxMileageKm}km threshold.`);
  } else {
    reasons.push(`Mileage ${listing.mileageKm}km is within the ${model.maxMileageKm}km threshold.`);
  }
  return points;
}

function scoreYear(listing: Listing, model: ModelCriteria, reasons: string[]): number {
  if (listing.year === undefined) {
    reasons.push('Model year not listed — scored as average.');
    return WEIGHTS.year * 0.5;
  }
  const currentYear = new Date().getFullYear();
  const badAt = model.minYear - 2;
  const points = scoreHigherIsBetter(listing.year, badAt, currentYear, WEIGHTS.year);

  if (listing.year < model.minYear) {
    reasons.push(`Year ${listing.year} is older than the preferred minimum (${model.minYear}).`);
  } else {
    reasons.push(`Year ${listing.year} meets the preferred minimum (${model.minYear}).`);
  }
  return points;
}

function scoreCity(listing: Listing, global: GlobalCriteria, reasons: string[]): number {
  const city = normalizeCity(listing.city);
  const index = global.preferredCities.findIndex((c) => normalizeCity(c) === city);

  if (index === -1) {
    reasons.push(`City "${listing.city}" is acceptable but not in the preferred list.`);
    return WEIGHTS.city * 0.5;
  }
  const rank = global.preferredCities.length <= 1 ? 0 : index / (global.preferredCities.length - 1);
  const points = WEIGHTS.city * (1 - rank * 0.4);
  reasons.push(
    `City "${listing.city}" is preferred (rank ${index + 1}/${global.preferredCities.length}).`,
  );
  return points;
}

/**
 * Scores a listing 0-100 against one model's criteria and the user's
 * global preferences. Higher is better; see {@link WEIGHTS} for how the
 * 100 points split across price, mileage, year, and city.
 */
export class ListingScorer {
  score(listing: Listing, model: ModelCriteria, global: GlobalCriteria): ScoreBreakdown {
    const reasons: string[] = [];
    const price = scorePrice(listing, model, reasons);
    const mileage = scoreMileage(listing, model, reasons);
    const year = scoreYear(listing, model, reasons);
    const city = scoreCity(listing, global, reasons);
    const total = Math.round(price + mileage + year + city);

    return {
      price: Math.round(price),
      mileage: Math.round(mileage),
      year: Math.round(year),
      city: Math.round(city),
      total,
      reasons,
    };
  }
}
