import type { Listing } from '../../../domain/entities/Listing.js';
import { parseListingUrl } from '../../../application/services/parseListingUrl.js';
import { parseNumber, slugifyWithHyphens } from '../shared/textParsing.js';

interface BikerDetail {
  readonly idannonce_moto?: number;
  readonly marque?: string;
  readonly model?: string;
  readonly titre?: string;
  readonly description?: string;
  readonly prix?: number | string;
  readonly anneemodele?: number | string;
  readonly kilometrage?: number | string;
  readonly cylindre?: number | string;
  readonly ville?: string;
  readonly dateajout?: string;
}

export class BikerListingFetchError extends Error {
  override readonly name = 'BikerListingFetchError';
  constructor(message: string) {
    super(message);
  }
}

/** Brand/model as Biker stores them — Compare prefers these over title fuzzy-match. */
export interface BikerListingResult {
  readonly listing: Listing;
  readonly brand: string;
  readonly model: string;
}

/**
 * Maps Biker's detail JSON onto {@link Listing}. Exported for unit tests.
 */
export function listingFromBikerDetail(
  data: BikerDetail,
  pageUrl: string,
  scrapedAt: Date = new Date(),
): BikerListingResult {
  const externalId = String(data.idannonce_moto ?? '');
  if (!externalId) throw new BikerListingFetchError('Could not find the Biker listing id.');

  const priceMAD =
    typeof data.prix === 'number' ? data.prix : parseNumber(String(data.prix ?? ''));
  if (priceMAD == null || !(priceMAD > 0)) {
    throw new BikerListingFetchError('That Biker listing has no asking price.');
  }

  const brand = (data.marque ?? '').trim();
  const model = (data.model ?? '').trim();
  const title =
    (data.titre ?? '').trim() ||
    [brand, model].filter(Boolean).join(' ') ||
    `Biker #${externalId}`;

  const year =
    typeof data.anneemodele === 'number'
      ? data.anneemodele
      : parseNumber(String(data.anneemodele ?? ''));
  const mileageKm =
    typeof data.kilometrage === 'number'
      ? data.kilometrage
      : parseNumber(String(data.kilometrage ?? ''));
  const cc = parseNumber(String(data.cylindre ?? ''));
  const displacementCc = cc && cc >= 25 && cc <= 3500 ? cc : undefined;

  const slug = slugifyWithHyphens(title) || 'moto';
  const url =
    pageUrl || `https://www.biker.ma/annonce/detail-moto/${slug}/${externalId}`;

  const posted = data.dateajout ? new Date(data.dateajout) : undefined;

  return {
    brand: brand || 'Unknown',
    model: model || title,
    listing: {
      sourceId: 'biker',
      externalId,
      url,
      title,
      description: data.description?.trim() || undefined,
      priceMAD,
      year: year != null && year >= 1950 ? year : undefined,
      mileageKm,
      displacementCc,
      vehicleType: 'motorcycle',
      fuelType: undefined,
      gearbox: undefined,
      city: (data.ville ?? '').trim() || 'Maroc',
      imageUrl: undefined,
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted : undefined,
      scrapedAt,
    },
  };
}

/** Fetches a Biker.ma listing via their public detail JSON API (Workers-safe). */
export async function fetchBikerListing(url: string): Promise<BikerListingResult> {
  const parsed = parseListingUrl(url);
  if (!parsed || parsed.sourceId !== 'biker') {
    throw new BikerListingFetchError('URL must be a Biker.ma listing link.');
  }

  let res: Response;
  try {
    res = await fetch(`https://www.biker.ma/api/v1/moto/detail/${parsed.externalId}`, {
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    throw new BikerListingFetchError(
      err instanceof Error ? err.message : 'Failed to reach Biker.ma.',
    );
  }

  if (res.status === 404) {
    throw new BikerListingFetchError('That Biker listing was not found (removed or sold).');
  }
  if (!res.ok) {
    throw new BikerListingFetchError(`Biker.ma returned HTTP ${res.status}.`);
  }

  const data = await res.json<BikerDetail>();
  return listingFromBikerDetail(data, parsed.url);
}
