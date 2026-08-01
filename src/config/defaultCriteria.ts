import type { SearchCriteria } from '../domain/entities/SearchCriteria.js';

/**
 * Edit this file to match what you're actually shopping for. Each entry in
 * `models` becomes one search run against every marketplace source.
 *
 * `priceRangeMAD` should reflect what you consider *fair* market value for
 * that model/condition in Morocco — it's the reference the scorer compares
 * listings against, not a hard filter. `aliases` should cover how sellers
 * actually write the model on Avito/Biker/Moteur (with/without dashes,
 * common misspellings, etc.) since the fuzzy matcher uses them.
 *
 * To override this without editing code, set CRITERIA_CONFIG_PATH to a
 * JSON file with the same shape (see README).
 */
export const defaultCriteria: SearchCriteria = {
  models: [
    {
      id: 'yamaha-mt07',
      brand: 'Yamaha',
      model: 'MT-07',
      aliases: ['MT07', 'MT 07', 'MT-07A'],
      priceRangeMAD: { min: 65000, max: 95000 },
      maxMileageKm: 30000,
      minYear: 2017,
    },
    {
      id: 'honda-cb500f',
      brand: 'Honda',
      model: 'CB500F',
      aliases: ['CB 500F', 'CB500', 'CB 500'],
      priceRangeMAD: { min: 55000, max: 80000 },
      maxMileageKm: 35000,
      minYear: 2016,
    },
    {
      id: 'kawasaki-z650',
      brand: 'Kawasaki',
      model: 'Z650',
      aliases: ['Z 650', 'Z650RS', 'Z 650 RS'],
      priceRangeMAD: { min: 60000, max: 90000 },
      maxMileageKm: 30000,
      minYear: 2017,
    },
  ],
  global: {
    preferredCities: ['Casablanca', 'Rabat', 'Mohammedia'],
    acceptableCities: [],
    minScoreForGoodDeal: 70,
    maxListingAgeDays: 14,
    minModelMatchConfidence: 0.55,
  },
};
