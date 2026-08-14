import type { Listing } from '../entities/Listing.js';
import type { SavedSearch } from '../entities/SavedSearch.js';

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
  if (search.modelIds.length > 0 && !search.modelIds.includes(matchedModelId)) return false;
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
