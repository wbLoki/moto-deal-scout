import type { Listing } from '../../../domain/entities/Listing.js';
import { parseNumber, parseYear } from '../shared/textParsing.js';
import { parseListingUrl } from '../../../application/services/parseListingUrl.js';

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
 * Exported for unit tests — the Playwright fetcher only loads the page.
 */
export function listingFromAvitoAd(
  ad: AvitoAd,
  pageUrl: string,
  scrapedAt: Date = new Date(),
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

  const year =
    typeof yearRaw === 'number' ? yearRaw : parseYear(paramText(yearRaw));
  const mileageKm =
    typeof mileageRaw === 'number' ? mileageRaw : parseNumber(paramText(mileageRaw));
  const displacementCc =
    typeof ccRaw === 'number' ? ccRaw : parseNumber(paramText(ccRaw));

  return {
    sourceId: 'avito',
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
    city: ad.location?.city?.name?.trim() || 'Maroc',
    imageUrl: undefined,
    postedAt: undefined,
    scrapedAt,
  };
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

/**
 * Opens an Avito listing URL in Playwright and returns a normalized {@link Listing}.
 * Requires a real Chromium (local `next-dev` / Node). Cloudflare Workers cannot run this.
 */
export async function fetchAvitoListing(url: string): Promise<Listing> {
  const parsed = parseListingUrl(url);
  if (!parsed || parsed.sourceId !== 'avito') {
    throw new AvitoListingFetchError('URL must be an Avito.ma motorcycle listing link.');
  }

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new AvitoListingFetchError(
      'Live Avito scan needs Playwright (run locally with `npm run next-dev`).',
    );
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'fr-MA',
    });
    await page.goto(parsed.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('#__NEXT_DATA__', { state: 'attached', timeout: 15_000 });
    const raw = await page.$eval('#__NEXT_DATA__', (el) => el.textContent);
    if (!raw) throw new AvitoListingFetchError('Avito page had no listing data.');
    const ad = adFromNextData(JSON.parse(raw));
    return listingFromAvitoAd(ad, parsed.url);
  } catch (err) {
    if (err instanceof AvitoListingFetchError) throw err;
    throw new AvitoListingFetchError(
      err instanceof Error ? err.message : 'Failed to open that Avito listing.',
    );
  } finally {
    await browser.close();
  }
}
