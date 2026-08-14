import type { ScoredListing } from '../src/domain/entities/ScoredListing.js';
import { isCalibrated } from '../src/domain/services/calibrationState.js';
import { dealTierFor } from '../src/domain/services/dealTier.js';
import { uniqueListingImages } from '../src/domain/listingImages.js';
import type { DealCardData } from './DealCardShell.js';

/** Flat, fully-serializable view of a scored listing for the client. */
export interface DealView extends DealCardData {
  modelId: string;
  matchConfidence: number;
}

/** Dates become ISO strings after `unstable_cache` round-trips; accept both. */
function toIso(value: Date | string | undefined | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

/** Drop seller portraits and Avito avatar stubs so cards show the vehicle. */
function displayableListingImage(url: string | undefined): string | null {
  if (!url) return null;
  if (
    /phoenix-assets|\/profile\/|avatar\.svg|\/avatars\/|\/users\/|\/user\/|^data:|no-photo|no_photo/i.test(
      url,
    )
  ) {
    return null;
  }
  if (url.startsWith('/') && !url.startsWith('//')) return null;
  return url;
}

/**
 * Maps a domain {@link ScoredListing} to the flat card view the client renders.
 * Shared by the server component's first paint and the paging server action so
 * both produce identical shapes.
 */
export function toDealView(scored: ScoredListing): DealView {
  const { listing, score, match } = scored;
  const tier = dealTierFor(score.total, isCalibrated(match.criteria));
  const imageUrls = uniqueListingImages(listing.imageUrls, listing.imageUrl ? [listing.imageUrl] : undefined)
    .map(displayableListingImage)
    .filter((url): url is string => url != null);
  return {
    key: `${listing.sourceId}:${listing.externalId}`,
    modelId: match.criteria.id,
    brand: match.criteria.brand,
    model: match.criteria.model,
    priceMAD: listing.priceMAD,
    year: listing.year ?? null,
    mileageKm: listing.mileageKm ?? null,
    city: listing.city,
    sourceId: listing.sourceId,
    externalId: listing.externalId,
    url: listing.url,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    matchConfidence: match.confidence,
    score: score.total,
    createdAt: listing.firstSeenAt ?? toIso(listing.scrapedAt) ?? '',
    postedAt: toIso(listing.postedAt),
    tierLabel: tier.label,
    tierLevel: tier.level,
    vehicleType: listing.vehicleType,
    fuelType: listing.fuelType ?? null,
    gearbox: listing.gearbox ?? null,
    firstOwner: listing.firstOwner ?? null,
    ww: listing.ww ?? null,
    accidented: listing.accidented ?? null,
    customsCleared: listing.customsCleared ?? null,
  };
}
