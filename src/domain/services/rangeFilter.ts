import type { Listing } from '../entities/Listing.js';
import type { SearchRange } from '../entities/SearchCriteria.js';

/**
 * Whether a listing falls inside a budget/year window. Price is always
 * present so the budget bound always applies; a listing with no stated year
 * can't be judged against the year bound, so it passes. Shared by the
 * scanner (if a global range is ever configured) and the per-user dashboard
 * filter, so both apply identical semantics.
 */
export function listingWithinRange(
  listing: Pick<Listing, 'priceMAD' | 'year'>,
  range: SearchRange,
): boolean {
  if (listing.priceMAD < range.budgetMin || listing.priceMAD > range.budgetMax) return false;
  if (
    listing.year !== undefined &&
    (listing.year < range.yearMin || listing.year > range.yearMax)
  ) {
    return false;
  }
  return true;
}
