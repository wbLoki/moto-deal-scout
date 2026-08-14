import type { Listing } from '../../src/domain/entities/Listing.js';
import type { GlobalCriteria, ModelCriteria } from '../../src/domain/entities/SearchCriteria.js';

export function makeModelCriteria(overrides: Partial<ModelCriteria> = {}): ModelCriteria {
  return {
    id: 'yamaha-mt07',
    brand: 'Yamaha',
    model: 'MT-07',
    aliases: ['MT07', 'MT 07'],
    priceRangeMAD: { min: 65000, max: 95000 },
    maxMileageKm: 30000,
    minYear: 2017,
    vehicleType: 'motorcycle',
    ...overrides,
  };
}

export function makeGlobalCriteria(overrides: Partial<GlobalCriteria> = {}): GlobalCriteria {
  return {
    preferredCities: ['Casablanca', 'Rabat', 'Mohammedia'],
    acceptableCities: [],
    minScoreForGoodDeal: 70,
    maxListingAgeDays: 14,
    minModelMatchConfidence: 0.55,
    minPriceFactor: 0.5,
    ...overrides,
  };
}

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    sourceId: 'avito',
    externalId: '12345',
    url: 'https://www.avito.ma/fr/casablanca/motos/Yamaha_MT_07_12345.htm',
    title: 'Yamaha MT-07 2019',
    description: undefined,
    priceMAD: 70000,
    year: 2019,
    mileageKm: 15000,
    displacementCc: 689,
    vehicleType: 'motorcycle',
    fuelType: undefined,
    gearbox: undefined,
    firstOwner: undefined,
    ww: undefined,
    accidented: undefined,
    customsCleared: undefined,
    city: 'Casablanca',
    imageUrl: undefined,
    postedAt: new Date(),
    scrapedAt: new Date(),
    ...overrides,
  };
}
