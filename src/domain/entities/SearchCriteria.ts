/** A price range considered fair market value for a given model. */
export interface PriceRangeMAD {
  readonly min: number;
  readonly max: number;
}

/**
 * A motorcycle model the user is hunting for, along with the reference
 * data needed to score listings that match it.
 *
 * `aliases` should include the common spellings/abbreviations sellers use
 * (e.g. "MT07", "MT-07", "mt 07") so the fuzzy matcher can find them even
 * when the marketplace's own search doesn't.
 */
export interface ModelCriteria {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly aliases: readonly string[];
  readonly priceRangeMAD: PriceRangeMAD;
  /** Listings above this mileage score poorly regardless of price. */
  readonly maxMileageKm: number;
  /** Listings older (model year) than this score poorly. */
  readonly minYear: number;
}

/**
 * Global preferences applied across all models: where to look, how good a
 * deal has to be before we bother the user about it, and how stale a
 * listing can be before we ignore it.
 */
export interface GlobalCriteria {
  /** Ordered best-to-worst; the first entries score highest on the city factor. */
  readonly preferredCities: readonly string[];
  /**
   * If non-empty, listings from cities outside this list are excluded
   * entirely (not just scored lower). Leave empty to accept any city.
   */
  readonly acceptableCities: readonly string[];
  /** Minimum total score (0-100) for a listing to count as a "good deal". */
  readonly minScoreForGoodDeal: number;
  /** Listings older than this (by postedAt, when known) are ignored. */
  readonly maxListingAgeDays: number;
  /** Minimum fuzzy-match confidence (0-1) to accept a title as matching a model. */
  readonly minModelMatchConfidence: number;
}

export interface SearchCriteria {
  readonly models: readonly ModelCriteria[];
  readonly global: GlobalCriteria;
}
