import type { FuelType, GearboxType, VehicleType } from './VehicleType.js';

/**
 * Marketplace identifiers. Add new sources here as they're implemented.
 * `avito` is motorcycles; `avito-cars` is Avito's car category so crawl
 * watermarks stay separate. `moteur` is the second car marketplace.
 * `wandaloo` is no longer scraped but is retained so historical rows still
 * read back. Historical `moteur` moto rows (if any) keep their stored
 * `vehicleType` and stay on the moto feed.
 */
export type MarketplaceId = 'avito' | 'biker' | 'moteur' | 'avito-cars' | 'wandaloo';

const MARKETPLACE_IDS: ReadonlySet<string> = new Set([
  'avito',
  'biker',
  'moteur',
  'avito-cars',
  'wandaloo',
]);

export function parseMarketplaceId(id: string): MarketplaceId | undefined {
  return MARKETPLACE_IDS.has(id) ? (id as MarketplaceId) : undefined;
}

/** True for the car-market source ids (never mixed into the moto feed). */
export function isCarMarketplace(id: string): boolean {
  return id === 'avito-cars' || id === 'wandaloo' || id === 'moteur';
}

/** Which vehicle market a marketplace source scrapes. */
export function vehicleTypeForMarketplace(id: MarketplaceId): VehicleType {
  return isCarMarketplace(id) ? 'car' : 'motorcycle';
}

/**
 * A normalized listing as scraped from a marketplace, before any scoring
 * or model matching has been applied.
 */
export interface Listing {
  readonly sourceId: MarketplaceId;
  /** Identifier unique within the source (ad id, URL slug, ...). */
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly priceMAD: number;
  readonly year: number | undefined;
  readonly mileageKm: number | undefined;
  /** Engine displacement in cc, when the source reports it. */
  readonly displacementCc: number | undefined;
  /** Motorcycle vs car. Set by the source that scraped this ad. */
  readonly vehicleType: VehicleType;
  /** Fuel, when the source reports it (cars). */
  readonly fuelType: FuelType | undefined;
  /** Gearbox, when the source reports it (cars). */
  readonly gearbox: GearboxType | undefined;
  /** Parsed from title/description; undefined = the ad didn't mention it. */
  readonly firstOwner: boolean | undefined;
  readonly ww: boolean | undefined;
  readonly accidented: boolean | undefined;
  readonly customsCleared: boolean | undefined;
  readonly city: string;
  readonly imageUrl: string | undefined;
  /** Publish date reported by the marketplace, when available. */
  readonly postedAt: Date | undefined;
  readonly scrapedAt: Date;
  /**
   * When we first stored this listing (DB `created_at`), as an ISO string.
   * Populated when read back from the database; undefined for a listing
   * freshly scraped in-memory. Drives the "newest first" sort.
   */
  readonly firstSeenAt?: string;
}

/** Stable key used for dedupe and "have we seen this before" lookups. */
export function listingKey(listing: Pick<Listing, 'sourceId' | 'externalId'>): string {
  return `${listing.sourceId}:${listing.externalId}`;
}
