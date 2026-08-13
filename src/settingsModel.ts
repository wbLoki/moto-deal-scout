import { searchRangeSchema } from './config/criteriaSchema.js';
import type { SearchRange } from './domain/entities/SearchCriteria.js';
import type { VehicleType } from './domain/entities/VehicleType.js';

/** Used until a user saves a range of their own. */
export const DEFAULT_SEARCH_RANGE: SearchRange = {
  budgetMin: 0,
  budgetMax: 200000,
  yearMin: 2015,
  yearMax: new Date().getFullYear() + 1,
};

/** Wider window for the cars feed (Moroccan used cars often sit above 200k MAD). */
export const DEFAULT_CAR_SEARCH_RANGE: SearchRange = {
  budgetMin: 0,
  budgetMax: 600000,
  yearMin: 2010,
  yearMax: new Date().getFullYear() + 1,
};

export function defaultSearchRangeFor(vehicleType: VehicleType): SearchRange {
  return vehicleType === 'car' ? DEFAULT_CAR_SEARCH_RANGE : DEFAULT_SEARCH_RANGE;
}

/**
 * Validates untrusted input (e.g. a form submission) into a SearchRange.
 * Throws a readable error if it's malformed or min/max are inverted.
 */
export function parseSearchRange(input: unknown): SearchRange {
  const result = searchRangeSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Invalid search range: ${details}`);
  }
  return result.data;
}
