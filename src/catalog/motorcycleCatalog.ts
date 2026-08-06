/**
 * A reference catalog of well-known motorcycle brands and their popular
 * models, used to make adding tracked models a pick-from-list instead of
 * free typing. It leans toward what's actually sold in Morocco (Japanese
 * big four, common European makes, scooter brands, and the Chinese/Indian
 * marques that are widespread here) plus globally famous models. It doesn't
 * need to be exhaustive — the admin can still type a custom brand/model.
 */
export interface CatalogBrand {
  readonly brand: string;
  readonly models: readonly string[];
}

export const MOTORCYCLE_CATALOG: readonly CatalogBrand[] = [
  {
    brand: 'Yamaha',
    models: [
      'MT-03',
      'MT-07',
      'MT-09',
      'MT-10',
      'MT-125',
      'YZF-R125',
      'YZF-R3',
      'YZF-R6',
      'YZF-R7',
      'YZF-R1',
      'XSR700',
      'XSR900',
      'Tracer 7',
      'Tracer 9',
      'Ténéré 700',
      'Super Ténéré 1200',
      'NMAX 125',
      'NMAX 155',
      'XMAX 125',
      'XMAX 300',
      'TMAX 560',
      'Aerox 155',
      'Tricity 125',
      'PW50',
    ],
  },
  {
    brand: 'Honda',
    models: [
      'CB125R',
      'CB300R',
      'CB500F',
      'CB500X',
      'CBR500R',
      'CB650R',
      'CBR650R',
      'CB1000R',
      'CBR600RR',
      'CBR1000RR-R',
      'Hornet 750',
      'NC750X',
      'Transalp 750',
      'Africa Twin',
      'Rebel 500',
      'Rebel 1100',
      'CRF300L',
      'Gold Wing',
      'Monkey 125',
      'Grom',
      'PCX 125',
      'SH125',
      'SH150',
      'Forza 125',
      'Forza 350',
      'X-ADV',
    ],
  },
  {
    brand: 'Kawasaki',
    models: [
      'Z125',
      'Z400',
      'Z650',
      'Z650RS',
      'Z900',
      'Z900RS',
      'Z1000',
      'Ninja 125',
      'Ninja 400',
      'Ninja 500',
      'Ninja 650',
      'Ninja 1000SX',
      'Ninja ZX-6R',
      'Ninja ZX-10R',
      'Versys 650',
      'Versys 1000',
      'Vulcan S',
      'W800',
      'KLR650',
      'Z H2',
    ],
  },
  {
    brand: 'Suzuki',
    models: [
      'GSX-R125',
      'GSX-S125',
      'SV650',
      'GSX-8S',
      'GSX-S750',
      'GSX-S1000',
      'GSX-R600',
      'GSX-R750',
      'GSX-R1000',
      'Hayabusa',
      'Katana',
      'V-Strom 250',
      'V-Strom 650',
      'V-Strom 1050',
      'Burgman 125',
      'Burgman 400',
      'Address 125',
      'DR650',
      'DRZ400',
    ],
  },
  {
    brand: 'BMW',
    models: [
      'G 310 R',
      'G 310 GS',
      'F 900 R',
      'F 900 XR',
      'F 800 GS',
      'F 850 GS',
      'F 750 GS',
      'R 1250 GS',
      'R 1300 GS',
      'R 1250 RT',
      'R nineT',
      'S 1000 R',
      'S 1000 RR',
      'S 1000 XR',
      'C 400 X',
      'C 400 GT',
      'CE 04',
    ],
  },
  {
    brand: 'KTM',
    models: [
      '125 Duke',
      '200 Duke',
      '250 Duke',
      '390 Duke',
      '690 Duke',
      '790 Duke',
      '890 Duke',
      '1290 Super Duke',
      'RC 125',
      'RC 200',
      'RC 390',
      '250 Adventure',
      '390 Adventure',
      '790 Adventure',
      '890 Adventure',
      '1290 Super Adventure',
      '690 SMC R',
    ],
  },
  {
    brand: 'Ducati',
    models: [
      'Monster',
      'Scrambler',
      'Panigale V2',
      'Panigale V4',
      'Streetfighter V4',
      'SuperSport 950',
      'Multistrada V4',
      'Multistrada V2',
      'Diavel V4',
      'Hypermotard',
      'DesertX',
    ],
  },
  {
    brand: 'Triumph',
    models: [
      'Trident 660',
      'Tiger Sport 660',
      'Street Triple',
      'Speed Triple',
      'Speed Twin',
      'Bonneville T100',
      'Bonneville T120',
      'Scrambler 900',
      'Scrambler 1200',
      'Tiger 900',
      'Tiger 1200',
      'Rocket 3',
      'Daytona 660',
    ],
  },
  {
    brand: 'Harley-Davidson',
    models: [
      'Iron 883',
      'Forty-Eight',
      'Nightster',
      'Sportster S',
      'Street 750',
      'Fat Boy',
      'Fat Bob',
      'Breakout',
      'Softail Standard',
      'Street Glide',
      'Road Glide',
      'Road King',
      'Pan America',
    ],
  },
  {
    brand: 'Royal Enfield',
    models: [
      'Classic 350',
      'Meteor 350',
      'Hunter 350',
      'Bullet 350',
      'Himalayan',
      'Scram 411',
      'Interceptor 650',
      'Continental GT 650',
      'Super Meteor 650',
      'Shotgun 650',
    ],
  },
  {
    brand: 'Aprilia',
    models: [
      'RS 125',
      'Tuono 125',
      'RS 457',
      'RS 660',
      'Tuono 660',
      'RSV4',
      'Tuono V4',
      'Shiver 900',
      'Dorsoduro 900',
      'SR GT 200',
    ],
  },
  {
    brand: 'Benelli',
    models: [
      'TNT 125',
      'TNT 250',
      '302S',
      'Leoncino 250',
      'Leoncino 500',
      'TRK 251',
      'TRK 502',
      'TRK 502X',
      '502C',
      'Imperiale 400',
    ],
  },
  {
    brand: 'CFMoto',
    models: ['250NK', '300NK', '650NK', '450SR', '250SR', '700CL-X', '650MT', '800MT', '450MT'],
  },
  {
    brand: 'Zontes',
    models: ['125U', '310T', '310R', '310V', '350T', '350R', '350X', '350GK', '703F'],
  },
  {
    brand: 'Voge',
    models: ['300R', '500R', '300 Rally', '500DS', '525 DSX', '900 DSX', 'SR4 350'],
  },
  {
    brand: 'QJMotor',
    models: ['SRK 400', 'SRK 700', 'SRV 550', 'SRT 550', 'SRT 750'],
  },
  {
    brand: 'Bajaj',
    models: [
      'Pulsar 125',
      'Pulsar 150',
      'Pulsar NS200',
      'Pulsar RS200',
      'Pulsar N250',
      'Dominar 250',
      'Dominar 400',
      'Avenger',
      'Boxer',
    ],
  },
  {
    brand: 'TVS',
    models: ['Apache RTR 160', 'Apache RTR 200', 'Apache RR 310', 'Ntorq 125', 'Ronin', 'Raider'],
  },
  {
    brand: 'Hero',
    models: ['Splendor', 'Glamour', 'Xtreme 160R', 'Xpulse 200', 'Karizma'],
  },
  {
    brand: 'Husqvarna',
    models: ['Svartpilen 125', 'Svartpilen 401', 'Vitpilen 401', 'Norden 901', '701 Enduro'],
  },
  {
    brand: 'Moto Guzzi',
    models: ['V7', 'V9', 'V85 TT', 'V100 Mandello', 'Griso'],
  },
  {
    brand: 'MV Agusta',
    models: ['Brutale 800', 'Dragster 800', 'F3 800', 'Turismo Veloce', 'Rush'],
  },
  {
    brand: 'Indian',
    models: ['Scout', 'FTR', 'Chief', 'Chieftain', 'Springfield'],
  },
  {
    brand: 'Vespa',
    models: ['Primavera 125', 'Sprint 125', 'GTS 125', 'GTS 300', 'GTV 300'],
  },
  {
    brand: 'Piaggio',
    models: ['Liberty 125', 'Medley 125', 'Beverly 300', 'Beverly 400', 'MP3', 'Zip'],
  },
  {
    brand: 'SYM',
    models: ['Symphony', 'Jet 14', 'Orbit', 'Fiddle', 'Cruisym', 'Joymax', 'Maxsym'],
  },
  {
    brand: 'Kymco',
    models: ['Agility', 'People', 'Like', 'Downtown', 'Xciting', 'AK 550', 'Super 8'],
  },
  {
    brand: 'Peugeot',
    models: ['Kisbee', 'Django', 'Tweet', 'Speedfight', 'Citystar', 'Metropolis'],
  },
  {
    brand: 'Keeway',
    models: ['RKF 125', 'RKS 125', 'Vieste 300', 'Superlight 125', 'K-Light'],
  },
];

/** Sorted brand names for pickers. */
export const CATALOG_BRANDS: readonly string[] = MOTORCYCLE_CATALOG.map((b) => b.brand).sort(
  (a, b) => a.localeCompare(b),
);

/** Models for a brand (as listed in the catalog), or an empty array. */
export function modelsForBrand(brand: string): readonly string[] {
  const key = brand.trim().toLowerCase();
  return MOTORCYCLE_CATALOG.find((b) => b.brand.toLowerCase() === key)?.models ?? [];
}

/**
 * Whether the reference catalog already lists this brand/model. Since the
 * weekly crawl auto-creates any catalog model it finds, a listed model needs
 * no request — it will appear on its own once one shows up for sale.
 */
export function catalogContains(brand: string, model: string): boolean {
  const key = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const brandKey = key(brand);
  const modelKey = key(model);
  return MOTORCYCLE_CATALOG.some(
    (b) => key(b.brand) === brandKey && b.models.some((m) => key(m) === modelKey),
  );
}

/**
 * Common spelling variants sellers use, generated from a model name so we
 * don't have to hand-maintain aliases per model. E.g. "MT-07" ->
 * ["MT07", "MT 07"], "GSX-R750" -> ["GSXR750", "GSX R750", ...]. The result
 * excludes the original and is de-duplicated; the admin can edit it.
 */
export function suggestAliases(model: string): string[] {
  const trimmed = model.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([
    trimmed.replace(/[-\s]+/g, ''), // remove separators: MT-07 -> MT07
    trimmed.replace(/[-\s]+/g, ' '), // normalize to spaces: MT-07 -> MT 07
    trimmed.replace(/-/g, ' '), // dashes -> spaces
    trimmed.replace(/\s+/g, '-'), // spaces -> dashes
  ]);
  variants.delete(trimmed);
  return [...variants].filter((v) => v.length > 0 && v.toLowerCase() !== trimmed.toLowerCase());
}
