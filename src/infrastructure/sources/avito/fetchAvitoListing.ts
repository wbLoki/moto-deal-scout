import type { Listing, MarketplaceId } from '../../../domain/entities/Listing.js';
import { vehicleTypeForMarketplace } from '../../../domain/entities/Listing.js';
import { parseListingCondition } from '../../../domain/entities/ListingCondition.js';
import { parseFuelType, parseGearbox } from '../../../domain/entities/VehicleType.js';
import { parseNumber, parseYear } from '../shared/textParsing.js';
import { parseListingUrl } from '../../../application/services/parseListingUrl.js';
import { normalizeListingImageUrl } from './parseAvitoSearchCards.js';
import {
  RestBrowserHtmlFetcher,
  tryGetWorkersBrowserBinding,
  WorkersBrowserHtmlFetcher,
} from '../../browser/cloudflareRenderedHtml.js';
import type { RenderedHtmlFetcher } from '../../browser/RenderedHtmlFetcher.js';
import { loadEnv } from '../../../config/env.js';

/** One Avito ad param (primary/secondary), value may be string or number. */
interface AvitoParam {
  readonly key?: string;
  readonly label?: string;
  readonly value?: string | number | { url?: string } | null;
}

interface AvitoAd {
  readonly listId?: string | number;
  readonly subject?: string;
  readonly description?: string;
  readonly price?: { readonly value?: number } | number | null;
  readonly location?: { readonly city?: { readonly name?: string } };
  readonly defaultImage?: string;
  readonly imageUrl?: string;
  readonly images?: readonly unknown[];
  readonly photos?: readonly unknown[];
  readonly params?: {
    readonly primary?: readonly AvitoParam[];
    readonly secondary?: readonly AvitoParam[];
    readonly extra?: readonly AvitoParam[];
  };
}

export class AvitoListingFetchError extends Error {
  override readonly name = 'AvitoListingFetchError';
  constructor(message: string) {
    super(message);
  }
}

function paramText(value: AvitoParam['value']): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && value.url) return value.url;
  return '';
}

function findParam(
  params: AvitoAd['params'],
  keys: readonly string[],
): string | number | undefined {
  const all = [
    ...(params?.primary ?? []),
    ...(params?.secondary ?? []),
    ...(params?.extra ?? []),
  ];
  for (const key of keys) {
    const hit = all.find((p) => p.key === key);
    if (hit?.value != null && typeof hit.value !== 'object') return hit.value;
  }
  return undefined;
}

/**
 * Maps Avito `__NEXT_DATA__` ad JSON onto our {@link Listing} shape.
 * Exported for unit tests.
 */
export function listingFromAvitoAd(
  ad: AvitoAd,
  pageUrl: string,
  scrapedAt: Date = new Date(),
  sourceId: MarketplaceId = 'avito',
): Listing {
  const parsed = parseListingUrl(pageUrl);
  const externalId = String(ad.listId ?? parsed?.externalId ?? '');
  if (!externalId) throw new AvitoListingFetchError('Could not find the Avito listing id.');

  const priceMAD =
    typeof ad.price === 'number'
      ? ad.price
      : typeof ad.price?.value === 'number'
        ? ad.price.value
        : undefined;
  if (priceMAD == null || !(priceMAD > 0)) {
    throw new AvitoListingFetchError('That Avito listing has no asking price.');
  }

  const yearRaw = findParam(ad.params, ['regdate']);
  const mileageRaw = findParam(ad.params, ['mileage_exact', 'mileage']);
  const ccRaw = findParam(ad.params, ['cylinder_size']);
  const fuelRaw = findParam(ad.params, ['fuel', 'carburant', 'fuel_type']);
  const gearboxRaw = findParam(ad.params, ['gearbox', 'transmission', 'boite', 'gearbox_type']);

  const year =
    typeof yearRaw === 'number' ? yearRaw : parseYear(paramText(yearRaw));
  const mileageKm =
    typeof mileageRaw === 'number' ? mileageRaw : parseNumber(paramText(mileageRaw));
  const displacementCc =
    typeof ccRaw === 'number' ? ccRaw : parseNumber(paramText(ccRaw));

  return {
    sourceId,
    externalId,
    url: pageUrl,
    title: (ad.subject ?? '').trim() || `Avito #${externalId}`,
    description: ad.description?.trim() || undefined,
    priceMAD,
    year,
    mileageKm,
    displacementCc:
      displacementCc != null && displacementCc >= 25 && displacementCc <= 3500
        ? displacementCc
        : undefined,
    vehicleType: vehicleTypeForMarketplace(sourceId),
    fuelType: parseFuelType(paramText(fuelRaw)),
    gearbox: parseGearbox(paramText(gearboxRaw)),
    ...parseListingCondition(
      (ad.subject ?? '').trim() || `Avito #${externalId}`,
      ad.description?.trim() || undefined,
    ),
    city: ad.location?.city?.name?.trim() || 'Maroc',
    imageUrl: extractAdImage(ad),
    postedAt: undefined,
    scrapedAt,
  };
}

function imageCandidateUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizeListingImageUrl(value);
  if (value && typeof value === 'object' && 'url' in value) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === 'string') return normalizeListingImageUrl(url);
  }
  return undefined;
}

function extractAdImage(ad: AvitoAd): string | undefined {
  const classifieds: string[] = [];
  const other: string[] = [];
  const push = (url: string | undefined): void => {
    if (!url) return;
    if (/classifieds\/images/i.test(url)) classifieds.push(url);
    else other.push(url);
  };
  push(imageCandidateUrl(ad.defaultImage));
  push(imageCandidateUrl(ad.imageUrl));
  for (const collection of [ad.images, ad.photos]) {
    for (const item of collection ?? []) push(imageCandidateUrl(item));
  }
  push(findAvitoCdnUrl(ad));
  return classifieds[0] ?? other[0];
}

function findAvitoCdnUrl(node: unknown, depth = 0): string | undefined {
  if (depth > 6 || node == null) return undefined;
  if (typeof node === 'string') {
    const url = normalizeListingImageUrl(node);
    return url && /classifieds\/images/i.test(url) ? url : undefined;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const url = findAvitoCdnUrl(item, depth + 1);
      if (url) return url;
    }
    return undefined;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const url = findAvitoCdnUrl(value, depth + 1);
      if (url) return url;
    }
  }
  return undefined;
}

/** Pulls the ad object from Avito's Next.js page props. */
export function adFromNextData(nextData: unknown): AvitoAd {
  const root = nextData as {
    props?: {
      pageProps?: {
        componentProps?: { adInfo?: { ad?: AvitoAd } };
        initialReduxState?: { ad?: { view?: { adInfo?: AvitoAd } } };
      };
    };
  };
  const ad =
    root.props?.pageProps?.componentProps?.adInfo?.ad ??
    root.props?.pageProps?.initialReduxState?.ad?.view?.adInfo;
  if (!ad) throw new AvitoListingFetchError('Could not read Avito listing data from the page.');
  return ad;
}

/** Parses `__NEXT_DATA__` from rendered listing HTML into a {@link Listing}. */
export function listingFromAvitoHtml(
  html: string,
  pageUrl: string,
  scrapedAt: Date = new Date(),
): Listing {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(\{[\s\S]*?\})<\/script>/,
  );
  if (!match?.[1]) {
    throw new AvitoListingFetchError('Avito page had no listing data (__NEXT_DATA__).');
  }
  const ad = adFromNextData(JSON.parse(match[1]));
  const parsed = parseListingUrl(pageUrl);
  return listingFromAvitoAd(ad, pageUrl, scrapedAt, parsed?.sourceId ?? 'avito');
}

/**
 * Opens an Avito listing URL via Cloudflare Browser Rendering (Workers binding
 * or REST) and returns a normalized {@link Listing}. Does not import Playwright
 * (safe for the OpenNext Worker graph).
 */
export async function fetchAvitoListing(url: string): Promise<Listing> {
  const parsed = parseListingUrl(url);
  if (!parsed || (parsed.sourceId !== 'avito' && parsed.sourceId !== 'avito-cars')) {
    throw new AvitoListingFetchError('URL must be an Avito.ma listing link.');
  }

  try {
    const fetcher = await resolveCompareHtmlFetcher();
    const html = await fetcher.fetchRenderedHtml(parsed.url, {
      waitForSelector: '#__NEXT_DATA__',
      timeoutMs: 45_000,
    });
    return listingFromAvitoHtml(html, parsed.url);
  } catch (err) {
    if (err instanceof AvitoListingFetchError) throw err;
    throw new AvitoListingFetchError(
      err instanceof Error ? err.message : 'Failed to open that Avito listing.',
    );
  }
}

async function resolveCompareHtmlFetcher(): Promise<RenderedHtmlFetcher> {
  const binding = await tryGetWorkersBrowserBinding();
  if (binding) return new WorkersBrowserHtmlFetcher(binding);

  const env = loadEnv();
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    return new RestBrowserHtmlFetcher(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
  }

  throw new AvitoListingFetchError(
    'Avito live scan needs Cloudflare Browser Rendering (Worker BROWSER binding or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN).',
  );
}
