import { parseHTML } from 'linkedom';
import type { Listing } from '../../../domain/entities/Listing.js';
import {
  parseNumber,
  parseRelativeFrenchDate,
  parseYear,
} from '../shared/textParsing.js';

/** Avito listing cards use a stable `data-testid` prefix (hashed class names churn). */
export const AVITO_CARD_SELECTOR = 'a[data-testid^="ad-card-v2-"]';

const AVITO_ORIGIN = 'https://www.avito.ma';
/** Seller avatars and lazy-load stubs — not listing photos. */
const NOT_LISTING_IMAGE =
  /phoenix-assets|\/profile\/avatar|avatar\.svg|^data:|placeholder|spacer|1x1/i;

export interface AvitoRawCard {
  readonly href: string;
  readonly title: string;
  readonly year: string;
  readonly mileage: string;
  readonly image: string;
  readonly price: string;
  readonly city: string;
  readonly relativeDate: string;
}

/**
 * Parses rendered Avito search/category HTML into listing cards.
 * Same field extraction as the former Playwright `page.$$eval` path.
 */
export function parseAvitoSearchCards(html: string, scrapedAt: Date = new Date()): Listing[] {
  const { document } = parseHTML(html);
  const cards = Array.from(document.querySelectorAll(AVITO_CARD_SELECTOR));
  const nextImages = avitoImagesFromNextData(html);
  const raw: AvitoRawCard[] = cards.map((card) => {
    const href = card.getAttribute('href') ?? '';
    const title = card.querySelector('h3')?.textContent?.trim() ?? '';
    const year = card.querySelector('span[title="Année-Modèle"]')?.textContent?.trim() ?? '';
    const mileage = card.querySelector('span[title="Kilométrage"]')?.textContent?.trim() ?? '';
    const image = pickAvitoCardImage(card);

    const spans = Array.from(card.querySelectorAll('span'));
    let price = '';
    for (let i = 0; i < spans.length; i++) {
      const t = spans[i]?.textContent?.trim() ?? '';
      if (/^[\d][\d\s.,]*$/.test(t) && spans[i + 1]?.textContent?.trim() === 'DH') {
        price = t;
        break;
      }
    }

    const spanTexts = spans.map((s) => s.textContent?.trim() ?? '').filter(Boolean);
    const dateIndex = spanTexts.findIndex((t) => /^(il y a|aujourd'hui|hier)/i.test(t));
    const city = dateIndex > 0 ? (spanTexts[dateIndex - 1] ?? '') : '';
    const relativeDate = dateIndex >= 0 ? (spanTexts[dateIndex] ?? '') : '';

    return { href, title, year, mileage, image, price, city, relativeDate };
  });

  return raw
    .filter((r) => r.href && r.title && parseNumber(r.price) !== undefined)
    .map((r) => rawCardToListing(r, scrapedAt, nextImages));
}

export function rawCardToListing(
  raw: AvitoRawCard,
  scrapedAt: Date = new Date(),
  nextImages: ReadonlyMap<string, string> = new Map(),
): Listing {
  const href = raw.href.startsWith('http') ? raw.href : `${AVITO_ORIGIN}${raw.href}`;
  const externalId = /_(\d+)\.htm/.exec(href)?.[1] ?? href;
  return {
    sourceId: 'avito',
    externalId,
    url: href,
    title: raw.title,
    description: undefined,
    priceMAD: parseNumber(raw.price)!,
    year: parseYear(raw.year),
    mileageKm: parseNumber(raw.mileage),
    displacementCc: undefined,
    city: raw.city || 'Maroc',
    imageUrl: normalizeListingImageUrl(raw.image) ?? nextImages.get(externalId),
    postedAt: parseRelativeFrenchDate(raw.relativeDate),
    scrapedAt,
  };
}

function firstSrcsetUrl(srcset: string): string {
  const urls = srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
  return urls.at(-1) ?? urls[0] ?? '';
}

/** Absolute http(s) listing photo, or undefined for avatars / placeholders. */
export function normalizeListingImageUrl(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed || NOT_LISTING_IMAGE.test(trimmed)) return undefined;
  const absolute = trimmed.startsWith('//')
    ? `https:${trimmed}`
    : trimmed.startsWith('/')
      ? `${AVITO_ORIGIN}${trimmed}`
      : trimmed;
  if (!/^https?:\/\//i.test(absolute) || NOT_LISTING_IMAGE.test(absolute)) return undefined;
  return absolute;
}

/** Photo from a listing detail page: og:image, then the first real listing img. */
export function listingImageFromHtml(html: string): string | undefined {
  const og =
    /property=["']og:image["'][^>]*content=["']([^"']+)/i.exec(html)?.[1] ??
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html)?.[1];
  const fromOg = normalizeListingImageUrl(og);
  if (fromOg) return fromOg;
  const { document } = parseHTML(html);
  let fallback: string | undefined;
  for (const img of Array.from(document.querySelectorAll('img'))) {
    for (const raw of urlsFromImg(img)) {
      const url = normalizeListingImageUrl(raw);
      if (!url) continue;
      if (/classifieds\/images/i.test(url)) return url;
      fallback ??= url;
    }
  }
  return fallback;
}

function urlsFromImg(img: Element): string[] {
  const out: string[] = [];
  for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-original'] as const) {
    const v = img.getAttribute(attr);
    if (v) out.push(v);
  }
  for (const attr of ['srcset', 'data-srcset'] as const) {
    const v = img.getAttribute(attr);
    if (v) out.push(firstSrcsetUrl(v));
  }
  return out;
}

function pickAvitoCardImage(card: Element): string {
  for (const img of Array.from(card.querySelectorAll('img'))) {
    for (const raw of urlsFromImg(img)) {
      const url = normalizeListingImageUrl(raw);
      if (url) return url;
    }
  }
  for (const source of Array.from(card.querySelectorAll('source'))) {
    const srcset = source.getAttribute('srcset') ?? source.getAttribute('data-srcset') ?? '';
    const url = normalizeListingImageUrl(firstSrcsetUrl(srcset));
    if (url) return url;
  }
  return '';
}

function avitoImagesFromNextData(html: string): ReadonlyMap<string, string> {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(\{[\s\S]*?\})<\/script>/,
  );
  if (!match?.[1]) return new Map();
  let json: unknown;
  try {
    json = JSON.parse(match[1]);
  } catch {
    return new Map();
  }
  const map = new Map<string, string>();
  walkForAvitoImages(json, map);
  return map;
}

function walkForAvitoImages(node: unknown, into: Map<string, string>): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkForAvitoImages(item, into);
    return;
  }
  const rec = node as Record<string, unknown>;
  const id = rec.listId ?? rec.id;
  const imageCandidate =
    (typeof rec.defaultImage === 'string' && rec.defaultImage) ||
    (Array.isArray(rec.images) && typeof rec.images[0] === 'string' && rec.images[0]) ||
    (typeof rec.imageUrl === 'string' && rec.imageUrl) ||
    '';
  if (id != null && imageCandidate) {
    const url = normalizeListingImageUrl(String(imageCandidate));
    if (url) into.set(String(id), url);
  }
  for (const value of Object.values(rec)) walkForAvitoImages(value, into);
}
