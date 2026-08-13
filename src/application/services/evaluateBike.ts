import type { Listing } from '../../domain/entities/Listing.js';
import type { GlobalCriteria, ModelCriteria } from '../../domain/entities/SearchCriteria.js';
import { isCalibrated } from '../../domain/services/calibrationState.js';
import { dealTierFor } from '../../domain/services/dealTier.js';
import { CAR_CATALOG } from '../../catalog/carCatalog.js';
import { MOTORCYCLE_CATALOG } from '../../catalog/motorcycleCatalog.js';
import { CatalogModelResolver } from './CatalogModelResolver.js';
import { FACTOR_WEIGHTS, ListingScorer } from './ListingScorer.js';
import { suggestPrice, type PriceSuggestion } from './priceAdvisor.js';
import type { VehicleType } from '../../domain/entities/VehicleType.js';

/** A vehicle to evaluate, as entered on the compare page. Only brand/model are required. */
export interface BikeInput {
  readonly brand: string;
  readonly model: string;
  readonly year?: number | undefined;
  readonly mileageKm?: number | undefined;
  /** Engine size in cc when known (form or AI-parsed ad). */
  readonly displacementCc?: number | undefined;
  /** Asking price. When omitted we still suggest a fair price but skip the rating verdict. */
  readonly priceMAD?: number | undefined;
  readonly city?: string | undefined;
  readonly vehicleType?: VehicleType;
}

/** One row of the score breakdown, e.g. Price 32/40. */
export interface FactorScore {
  readonly label: string;
  readonly points: number;
  readonly max: number;
}

export type BikeEvaluationStatus = 'rated' | 'calibrating' | 'not-found' | 'ai-estimated';

/** The verdict for an entered asking price. Present only when a price was given. */
export interface BikeRating {
  readonly tierLevel: string;
  readonly tierLabel: string;
  readonly score: number;
  readonly askingPriceMAD: number;
  readonly factors: readonly FactorScore[];
  readonly reasons: readonly string[];
  /** Where the asking price sits relative to the model's fair range. */
  readonly pricePosition: 'below' | 'within' | 'above';
}

export interface BikeEvaluation {
  readonly status: BikeEvaluationStatus;
  /** The model we matched to, present unless `not-found`. */
  readonly matched?: { readonly brand: string; readonly model: string; readonly confidence: number };
  /** Present when a fair range is known (calibrated or AI) and an asking price was entered. */
  readonly rating?: BikeRating;
  /** Present when a fair range is known (independent of asking price). */
  readonly suggestion?: PriceSuggestion;
  /** Present only for `ai-estimated`: the range came from Claude, not our market data. */
  readonly ai?: { readonly confidence: 'low' | 'medium' | 'high'; readonly rationale: string };
}

function pricePosition(price: number, model: ModelCriteria): 'below' | 'within' | 'above' {
  if (price < model.priceRangeMAD.min) return 'below';
  if (price > model.priceRangeMAD.max) return 'above';
  return 'within';
}

/** Builds the minimal Listing the scorer reads (price, mileage, year, city). */
function toListing(input: BikeInput, priceMAD: number): Listing {
  return {
    sourceId: input.vehicleType === 'car' ? 'avito-cars' : 'avito',
    externalId: 'compare',
    url: '',
    title: `${input.brand} ${input.model}`.trim(),
    description: undefined,
    priceMAD,
    year: input.year,
    mileageKm: input.mileageKm,
    displacementCc: input.displacementCc,
    vehicleType: input.vehicleType ?? 'motorcycle',
    fuelType: undefined,
    gearbox: undefined,
    city: input.city ?? '',
    imageUrl: undefined,
    postedAt: undefined,
    scrapedAt: new Date(),
  };
}

/**
 * Scores a bike against one model's fair range using the exact same scorer,
 * tiers and price advisor as the deal feed — so nothing here can disagree with
 * the cards. Shared by the tracked-model path ({@link evaluateBike}) and the
 * AI-estimate path, which passes a synthetic model built from Claude's range.
 * The model must carry a real fair range (min > 0); the caller guarantees it.
 */
export function scoreAgainstModel(
  input: BikeInput,
  model: ModelCriteria,
  global: GlobalCriteria,
): { rating?: BikeRating; suggestion: PriceSuggestion } {
  // Mileage/year/city sub-scores don't depend on price, so a placeholder lets
  // us derive the suggestion even when no asking price was entered.
  const listing = toListing(input, input.priceMAD ?? model.priceRangeMAD.min);
  const breakdown = new ListingScorer().score(listing, model, global);
  const suggestion = suggestPrice(model, breakdown);

  if (input.priceMAD === undefined) return { suggestion };

  const tier = dealTierFor(breakdown.total, true);
  const rating: BikeRating = {
    tierLevel: tier.level,
    tierLabel: tier.label,
    score: breakdown.total,
    askingPriceMAD: input.priceMAD,
    factors: [
      { label: 'Price', points: breakdown.price, max: FACTOR_WEIGHTS.price },
      { label: 'Mileage', points: breakdown.mileage, max: FACTOR_WEIGHTS.mileage },
      { label: 'Year', points: breakdown.year, max: FACTOR_WEIGHTS.year },
      { label: 'City', points: breakdown.city, max: FACTOR_WEIGHTS.city },
    ],
    reasons: breakdown.reasons,
    pricePosition: pricePosition(input.priceMAD, model),
  };
  return { rating, suggestion };
}

/**
 * Rates a user-entered bike and suggests a fair price, using the exact same
 * matcher, scorer and tier thresholds as the deal feed. Pure: DB loading lives
 * in `compareModel`.
 *
 * - `not-found`: no catalog model matched confidently.
 * - `calibrating`: matched a model we don't yet have a fair price for.
 * - `rated`: matched a calibrated model; always carries a suggestion, and a
 *   rating too when an asking price was entered.
 */
export function evaluateBike(
  input: BikeInput,
  ctx: { models: readonly ModelCriteria[]; global: GlobalCriteria },
): BikeEvaluation {
  // Resolve against the brand-aware catalog, not a bare fuzzy match: the form
  // gives us a definite brand, so "Honda CBR500R" must never fall through to a
  // similarly-named model from another maker (e.g. a Voge 500R). Then look the
  // resolved model up among the tracked models to get its fair range.
  const catalog = input.vehicleType === 'car' ? CAR_CATALOG : MOTORCYCLE_CATALOG;
  const match = new CatalogModelResolver(catalog).resolve(`${input.brand} ${input.model}`.trim());
  const model = match ? ctx.models.find((m) => m.id === match.id) : undefined;
  if (!match || !model) {
    return { status: 'not-found' };
  }
  const matched = { brand: model.brand, model: model.model, confidence: match.confidence };
  if (!isCalibrated(model)) {
    return { status: 'calibrating', matched };
  }

  const { rating, suggestion } = scoreAgainstModel(input, model, ctx.global);
  return { status: 'rated', matched, ...(rating ? { rating } : {}), suggestion };
}
