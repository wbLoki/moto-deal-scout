import type { Listing } from './Listing.js';
import type { ModelCriteria } from './SearchCriteria.js';

/** Points awarded per factor, plus the total (0-100) and human-readable notes. */
export interface ScoreBreakdown {
  readonly price: number;
  readonly mileage: number;
  readonly year: number;
  readonly city: number;
  readonly total: number;
  readonly reasons: readonly string[];
}

/** Result of fuzzy-matching a listing's title against the wanted model list. */
export interface ModelMatch {
  readonly criteria: ModelCriteria;
  /** 0 (no confidence) to 1 (exact match). */
  readonly confidence: number;
}

/** A listing enriched with the model it matched and its computed score. */
export interface ScoredListing {
  readonly listing: Listing;
  readonly match: ModelMatch;
  readonly score: ScoreBreakdown;
  readonly isGoodDeal: boolean;
}
