import { describe, expect, it } from 'vitest';
import type { SavedSearch } from '../../src/domain/entities/SavedSearch.js';
import { listingMatchesSavedSearch } from '../../src/domain/services/savedSearchMatch.js';
import { makeListing } from '../fixtures/sampleData.js';

function search(over: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 's1',
    userId: 'u1',
    name: 'Motos',
    vehicleType: 'motorcycle',
    budgetMin: 0,
    budgetMax: 200000,
    yearMin: 2015,
    yearMax: 2026,
    mileageMax: 0,
    brands: [],
    cities: [],
    fuelTypes: [],
    gearboxes: [],
    modelIds: [],
    ...over,
  };
}

describe('listingMatchesSavedSearch', () => {
  it('matches an open search on vehicle type, budget and year', () => {
    const listing = makeListing({ priceMAD: 70000, year: 2019, vehicleType: 'motorcycle' });
    expect(listingMatchesSavedSearch(listing, search(), 'yamaha-mt07', 'Yamaha')).toBe(true);
  });

  it('rejects a car listing against a motorcycle search', () => {
    const listing = makeListing({ priceMAD: 70000, year: 2019, vehicleType: 'car' });
    expect(listingMatchesSavedSearch(listing, search(), 'dacia-duster', 'Dacia')).toBe(false);
  });

  it('rejects when model ids are set and the listing is not among them', () => {
    const listing = makeListing({ priceMAD: 70000, year: 2019 });
    expect(
      listingMatchesSavedSearch(listing, search({ modelIds: ['honda-cb500f'] }), 'yamaha-mt07', 'Yamaha'),
    ).toBe(false);
  });

  it('covers displacement variants of a watched model, but not a glued series suffix', () => {
    const listing = makeListing({ priceMAD: 70000, year: 2019 });
    const nmax = search({ modelIds: ['yamaha-nmax'] });
    expect(listingMatchesSavedSearch(listing, nmax, 'yamaha-nmax', 'Yamaha')).toBe(true);
    expect(listingMatchesSavedSearch(listing, nmax, 'yamaha-nmax-155', 'Yamaha')).toBe(true);
    expect(listingMatchesSavedSearch(listing, nmax, 'yamaha-mt07', 'Yamaha')).toBe(false);
    const z650 = search({ modelIds: ['kawasaki-z650'] });
    expect(listingMatchesSavedSearch(listing, z650, 'kawasaki-z650', 'Kawasaki')).toBe(true);
    expect(listingMatchesSavedSearch(listing, z650, 'kawasaki-z650rs', 'Kawasaki')).toBe(false);
  });
});
