import type { Listing } from '../domain/entities/Listing.js';

const MIN_CC = 50;
const MAX_CC = 3500;

/**
 * Catalog models whose name does not contain the real engine size (or whose
 * number is a series, not cc). Keys are {@link catalogKey} of the model name.
 */
const KNOWN_CC: Readonly<Record<string, number>> = {
  'mt 03': 321,
  'mt 07': 689,
  'mt 09': 890,
  'mt 10': 998,
  'yzf r3': 321,
  'yzf r6': 599,
  'yzf r7': 689,
  'yzf r1': 998,
  'xsr700': 689,
  'xsr900': 847,
  'tracer 7': 689,
  'tracer 9': 890,
  'tenere 700': 689,
  'africa twin': 1084,
  'gold wing': 1833,
  'grom': 125,
  'x adv': 745,
  'ninja zx 6r': 636,
  'ninja zx 10r': 998,
  'z h2': 998,
  'vulcan s': 649,
  'gsx 8s': 776,
  'hayabusa': 1340,
  'katana': 999,
  'r ninet': 1170,
  'ce 04': 0,
  'monster': 937,
  'scrambler': 803,
  'panigale v2': 890,
  'panigale v4': 1103,
  'streetfighter v4': 1103,
  'multistrada v4': 1158,
  'multistrada v2': 890,
  'diavel v4': 1158,
  'hypermotard': 937,
  'desertx': 937,
  'street triple': 765,
  'speed triple': 1160,
  'speed twin': 1200,
  'bonneville t100': 900,
  'bonneville t120': 1200,
  'rocket 3': 2458,
  'iron 883': 883,
  'forty eight': 1202,
  'nightster': 975,
  'sportster s': 1252,
  'fat boy': 1868,
  'fat bob': 1868,
  'breakout': 1868,
  'softail standard': 1746,
  'street glide': 1868,
  'road glide': 1868,
  'road king': 1868,
  'pan america': 1252,
  'himalayan': 411,
  'rsv4': 1099,
  'tuono v4': 1099,
  'v7': 744,
  'v9': 853,
  'v85 tt': 853,
  'v100 mandello': 1042,
  'griso': 1151,
  'turismo veloce': 798,
  'rush': 798,
  'scout': 1133,
  'ftr': 1203,
  'chief': 1890,
  'chieftain': 1890,
  'springfield': 1890,
  'mp3': 0,
  'zip': 50,
  'jet 14': 125,
  'symphony': 125,
  'orbit': 125,
  'fiddle': 125,
  'cruisym': 300,
  'joymax': 300,
  'maxsym': 400,
  'agility': 125,
  'people': 125,
  'like': 125,
  'downtown': 300,
  'xciting': 400,
  'super 8': 125,
  'kisbee': 50,
  'django': 125,
  'tweet': 125,
  'speedfight': 125,
  'citystar': 125,
  'metropolis': 400,
  'k light': 125,
  'avenger': 220,
  'boxer': 100,
  'splendor': 100,
  'glamour': 125,
  'ronin': 225,
  'raider': 125,
  'karizma': 250,
  'nmax': 0,
};

function catalogKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Largest number in the name that looks like an engine size. */
function ccFromName(name: string): number | undefined {
  const nums = [...catalogKey(name).matchAll(/\d+/g)].map((m) => Number(m[0]));
  const candidates = nums.filter((n) => n >= MIN_CC && n <= MAX_CC);
  if (candidates.length === 0) return undefined;
  return Math.max(...candidates);
}

/**
 * Typical engine size in cc for a catalog model name, or `0` when unknown
 * (ambiguous variants like a bare "NMAX", or a name with no size).
 */
export function fallbackDisplacementCc(modelName: string): number {
  const key = catalogKey(modelName);
  if (!key) return 0;
  if (Object.prototype.hasOwnProperty.call(KNOWN_CC, key)) return KNOWN_CC[key]!;
  return ccFromName(key) ?? 0;
}

/**
 * Prefers the size the marketplace reported; otherwise the catalog model's
 * typical cc; otherwise `0`. Cars always default to `0`.
 */
export function withListingDisplacement(listing: Listing, modelName: string): Listing {
  if (listing.vehicleType === 'car') {
    return listing.displacementCc != null ? listing : { ...listing, displacementCc: 0 };
  }
  if (listing.displacementCc != null && listing.displacementCc > 0) return listing;
  return { ...listing, displacementCc: fallbackDisplacementCc(modelName) };
}
