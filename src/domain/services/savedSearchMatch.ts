import type { Listing } from '../entities/Listing.js';
import type { SavedSearch } from '../entities/SavedSearch.js';

/**
 * True when a listing's matched model is one the search watches. A bare
 * catalog name also covers displacement variants (`yamaha-nmax` matches
 * `yamaha-nmax-155`) because ads often omit or include the cc. A distinct
 * series (`kawasaki-z650` vs `kawasaki-z650rs`) does not match — variants
 * are hyphen-suffixed ids, not a glued suffix.
 */
export function savedSearchCoversModelId(
  listingModelId: string,
  watchedIds: readonly string[],
): boolean {
  if (watchedIds.length === 0) return true;
  return watchedIds.some((id) => listingModelId === id || listingModelId.startsWith(`${id}-`));
}

/** True when a listing satisfies every set constraint on the saved search. */
export function listingMatchesSavedSearch(
  listing: Pick<
    Listing,
    | 'priceMAD'
    | 'year'
    | 'mileageKm'
    | 'city'
    | 'fuelType'
    | 'gearbox'
    | 'vehicleType'
  > & { readonly matchedModelId?: string; readonly brand?: string },
  search: SavedSearch,
  matchedModelId: string,
  brand: string,
): boolean {
  if (listing.vehicleType !== search.vehicleType) return false;
  if (listing.priceMAD < search.budgetMin || listing.priceMAD > search.budgetMax) return false;
  if (
    listing.year !== undefined &&
    (listing.year < search.yearMin || listing.year > search.yearMax)
  ) {
    return false;
  }
  if (
    search.mileageMax > 0 &&
    listing.mileageKm !== undefined &&
    listing.mileageKm > search.mileageMax
  ) {
    return false;
  }
  if (!savedSearchCoversModelId(matchedModelId, search.modelIds)) return false;
  if (search.brands.length > 0) {
    const needle = brand.trim().toLowerCase();
    if (!search.brands.some((b) => b.trim().toLowerCase() === needle)) return false;
  }
  if (search.cities.length > 0) {
    const city = listing.city.trim().toLowerCase();
    if (!search.cities.some((c) => c.trim().toLowerCase() === city)) return false;
  }
  if (search.fuelTypes.length > 0) {
    if (!listing.fuelType || !search.fuelTypes.includes(listing.fuelType)) return false;
  }
  if (search.gearboxes.length > 0) {
    if (!listing.gearbox || !search.gearboxes.includes(listing.gearbox)) return false;
  }
  return true;
}
