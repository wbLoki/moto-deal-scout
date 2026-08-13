import type { CatalogBrand } from './motorcycleCatalog.js';

/**
 * Morocco-leaning used-car catalog: the marques and models that actually
 * turn up on Avito. Not exhaustive — discovery + admin can still add more.
 */
export const CAR_CATALOG: readonly CatalogBrand[] = [
  {
    brand: 'Dacia',
    models: [
      'Logan',
      'Sandero',
      'Sandero Stepway',
      'Duster',
      'Lodgy',
      'Dokker',
      'Spring',
      'Jogger',
    ],
  },
  {
    brand: 'Renault',
    models: [
      'Clio',
      'Clio 4',
      'Clio 5',
      'Megane',
      'Megane 3',
      'Megane 4',
      'Captur',
      'Kadjar',
      'Symbol',
      'Express',
      'Kangoo',
      'Talisman',
      'Austral',
    ],
  },
  {
    brand: 'Peugeot',
    models: ['208', '308', '2008', '3008', '5008', '301', '508', 'Partner', 'Rifter', 'Expert'],
  },
  {
    brand: 'Citroën',
    models: ['C3', 'C4', 'C-Elysée', 'C5 Aircross', 'Berlingo', 'C4 Cactus', 'C3 Aircross'],
  },
  {
    brand: 'Volkswagen',
    models: ['Golf', 'Golf 7', 'Golf 8', 'Polo', 'Passat', 'Tiguan', 'Touareg', 'T-Roc', 'Caddy', 'Jetta'],
  },
  {
    brand: 'Hyundai',
    models: ['i10', 'i20', 'Accent', 'Elantra', 'Tucson', 'Creta', 'Santa Fe', 'Kona', 'i30'],
  },
  {
    brand: 'Kia',
    models: ['Picanto', 'Rio', 'Cerato', 'Sportage', 'Sorento', 'Stonic', 'Seltos', 'Carnival'],
  },
  {
    brand: 'Toyota',
    models: [
      'Yaris',
      'Corolla',
      'RAV4',
      'Hilux',
      'Land Cruiser',
      'Prado',
      'Auris',
      'C-HR',
      'Fortuner',
      'Camry',
    ],
  },
  {
    brand: 'Mercedes',
    models: ['Classe A', 'Classe B', 'Classe C', 'Classe E', 'CLA', 'GLA', 'GLC', 'GLE', 'Vito'],
  },
  {
    brand: 'BMW',
    models: ['Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'X1', 'X3', 'X5', 'X6'],
  },
  {
    brand: 'Audi',
    models: ['A1', 'A3', 'A4', 'A5', 'A6', 'Q2', 'Q3', 'Q5', 'Q7'],
  },
  {
    brand: 'Fiat',
    models: ['Punto', 'Tipo', '500', 'Panda', 'Doblo', '500X', '500L'],
  },
  {
    brand: 'Ford',
    models: ['Fiesta', 'Focus', 'Kuga', 'Puma', 'Ranger', 'EcoSport', 'Mondeo', 'Mustang'],
  },
  {
    brand: 'Opel',
    models: ['Corsa', 'Astra', 'Mokka', 'Crossland', 'Grandland', 'Insignia'],
  },
  {
    brand: 'Nissan',
    models: ['Qashqai', 'Juke', 'Micra', 'X-Trail', 'Navara', 'Note', 'Patrol'],
  },
  {
    brand: 'Honda',
    models: ['Civic', 'CR-V', 'Jazz', 'HR-V', 'Accord', 'City'],
  },
  {
    brand: 'Suzuki',
    models: ['Swift', 'Vitara', 'Jimny', 'S-Cross', 'Baleno', 'Alto'],
  },
  {
    brand: 'Seat',
    models: ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco'],
  },
  {
    brand: 'Skoda',
    models: ['Octavia', 'Fabia', 'Superb', 'Karoq', 'Kodiaq', 'Kamiq', 'Rapid'],
  },
  {
    brand: 'Mazda',
    models: ['Mazda 2', 'Mazda 3', 'Mazda 6', 'CX-3', 'CX-5', 'CX-30'],
  },
  {
    brand: 'Jeep',
    models: ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler'],
  },
  {
    brand: 'Land Rover',
    models: ['Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Discovery', 'Defender'],
  },
  {
    brand: 'Volvo',
    models: ['XC40', 'XC60', 'XC90', 'S60', 'V40', 'S90'],
  },
  {
    brand: 'BYD',
    models: ['Atto 3', 'Dolphin', 'Seal', 'Song Plus', 'Han'],
  },
  {
    brand: 'Chery',
    models: ['Tiggo 2', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Arrizo'],
  },
  {
    brand: 'MG',
    models: ['ZS', 'HS', 'MG3', 'MG4', 'MG5'],
  },
  {
    brand: 'Geely',
    models: ['Coolray', 'Geometry C', 'Emgrand', 'Tugella'],
  },
  {
    brand: 'Mitsubishi',
    models: ['L200', 'Pajero', 'ASX', 'Outlander', 'Eclipse Cross'],
  },
  {
    brand: 'Chevrolet',
    models: ['Spark', 'Aveo', 'Cruze', 'Captiva', 'Trailblazer'],
  },
];

export function carModelsForBrand(brand: string): readonly string[] {
  const key = brand.trim().toLowerCase();
  return CAR_CATALOG.find((b) => b.brand.toLowerCase() === key)?.models ?? [];
}
