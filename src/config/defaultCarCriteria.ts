import type { ModelCriteria } from '../domain/entities/SearchCriteria.js';

/** First-run car models when the cars catalog is empty. Fair ranges are MAD. */
export const defaultCarModels: readonly ModelCriteria[] = [
  {
    id: 'dacia-duster',
    brand: 'Dacia',
    model: 'Duster',
    aliases: ['Duster 4x4', 'Duster 4x2'],
    priceRangeMAD: { min: 120000, max: 220000 },
    maxMileageKm: 150000,
    minYear: 2015,
    vehicleType: 'car',
  },
  {
    id: 'renault-clio',
    brand: 'Renault',
    model: 'Clio',
    aliases: ['Clio 4', 'Clio IV', 'Clio 5', 'Clio V'],
    priceRangeMAD: { min: 80000, max: 160000 },
    maxMileageKm: 150000,
    minYear: 2014,
    vehicleType: 'car',
  },
  {
    id: 'peugeot-208',
    brand: 'Peugeot',
    model: '208',
    aliases: ['208 allure', '208 active'],
    priceRangeMAD: { min: 90000, max: 170000 },
    maxMileageKm: 150000,
    minYear: 2015,
    vehicleType: 'car',
  },
];
