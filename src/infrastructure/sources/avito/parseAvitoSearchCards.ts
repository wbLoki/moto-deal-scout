import { parseHTML } from 'linkedom';
import type { Listing, MarketplaceId } from '../../../domain/entities/Listing.js';
import { parseListingCondition } from '../../../domain/entities/ListingCondition.js';
import type { FuelType, GearboxType, VehicleType } from '../../../domain/entities/VehicleType.js';
import { parseFuelType, parseGearbox } from '../../../domain/entities/VehicleType.js';
import {
  parseNumber,
  parseRelativeFrenchDate,
  parseYear,
} from '../shared/textParsing.js';

/** Avito listing cards use a stable `data-testid` prefix (hashed class names churn). */
export const AVITO_CARD_SELECTOR = 'a[data-testid^="ad-card-v2-"]';

const AVITO_ORIGIN = 'https://www.avito.ma';
/** Avito listing photos live on this CDN path; seller portraits do not. */
const AVITO_LISTING_PHOTO = /classifieds\/images/i;
/**
 * Seller portraits, default avatars, and lazy-load stubs — not the ad photo.
 * Uploaded profile pics are real `content.avito.ma` URLs, so we cannot treat
 * "any https image" as a listing thumb.
 */
const NOT_LISTING_IMAGE =
  /phoenix-assets|\/profile\/|avatar\.svg|\/avatars\/|\/users\/|\/user\/|\/u\/(?:avatar|profile)|t=avatar|^data:|placeholder|spacer|1x1|no-photo|no_photo/i;

export interface AvitoRawCard {
  readonly href: string;
  readonly title: string;
  readonly year: string;
  readonly mileage: string;
  readonly image: string;
  readonly price: string;
  readonly city: string;
  readonly relativeDate: string;
  readonly fuel: string;
  readonly gearbox: string;
}

export interface AvitoCardContext {
  readonly sourceId: MarketplaceId;
  readonly vehicleType: VehicleType;
}

const DEFAULT_CARD_CONTEXT: AvitoCardContext = {
  sourceId: 'avito',
  vehicleType: 'motorcycle',
};

/**
 * Parses rendered Avito search/category HTML into listing cards.
 * Same field extraction as the former Playwright `page.$$eval` path.
 */
export function parseAvitoSearchCards(
  html: string,
  scrapedAt: Date = new Date(),
  context: AvitoCardContext = DEFAULT_CARD_CONTEXT,
): Listing[] {
  const { document } = parseHTML(html);
  const cards = Array.from(document.querySelectorAll(AVITO_CARD_SELECTOR));
  const nextImages = avitoImagesFromNextData(html);
  const raw: AvitoRawCard[] = cards.map((card) => {
    const href = card.getAttribute('href') ?? '';
    const title = card.querySelector('h3')?.textContent?.trim() ?? '';
    const year = card.querySelector('span[title="Année-Modèle"]')?.textContent?.trim() ?? '';
    const mileage = card.querySelector('span[title="Kilométrage"]')?.textContent?.trim() ?? '';
    const fuel =
      card.querySelector('span[title="Carburant"]')?.textContent?.trim() ??
      card.querySelector('span[title="Type de carburant"]')?.textContent?.trim() ??
      '';
    const gearbox =
      card.querySelector('span[title="Boite de vitesses"]')?.textContent?.trim() ??
      card.querySelector('span[title="Boîte de vitesses"]')?.textContent?.trim() ??
      card.querySelector('span[title="Boite de vitesse"]')?.textContent?.trim() ??
      '';
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

    return { href, title, year, mileage, image, price, city, relativeDate, fuel, gearbox };
  });

  return raw
    .filter((r) => r.href && r.title && parseNumber(r.price) !== undefined)
    .map((r) => rawCardToListing(r, scrapedAt, nextImages, context));
}

export function rawCardToListing(
  raw: AvitoRawCard,
  scrapedAt: Date = new Date(),
  nextImages: ReadonlyMap<string, string> = new Map(),
  context: AvitoCardContext = DEFAULT_CARD_CONTEXT,
): Listing {
  const href = raw.href.startsWith('http') ? raw.href : `${AVITO_ORIGIN}${raw.href}`;
  const externalId = /_(\d+)\.htm/.exec(href)?.[1] ?? href;
  const fuelType: FuelType | undefined = parseFuelType(raw.fuel);
  const gearbox: GearboxType | undefined = parseGearbox(raw.gearbox);
  return {
    sourceId: context.sourceId,
    externalId,
    url: href,
    title: raw.title,
    description: undefined,
    priceMAD: parseNumber(raw.price)!,
    year: parseYear(raw.year),
    mileageKm: parseNumber(raw.mileage),
    displacementCc: undefined,
    vehicleType: context.vehicleType,
    fuelType,
    gearbox,
    ...parseListingCondition(raw.title, undefined),
    city: raw.city || 'Maroc',
    imageUrl: preferListingPhoto(normalizeListingImageUrl(raw.image), nextImages.get(externalId)),
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

/** True when `url` is a seller portrait / placeholder, not the vehicle photo. */
export function isSellerOrPlaceholderImage(url: string): boolean {
  return NOT_LISTING_IMAGE.test(url);
}

/**
 * Prefers Avito `classifieds/images` (the ad photo) over any other candidate,
 * so a seller portrait that appears first in the card DOM cannot win.
 */
export function preferListingPhoto(
  ...candidates: Array<string | undefined>
): string | undefined {
  const urls = candidates.filter((u): u is string => Boolean(u));
  return urls.find((u) => AVITO_LISTING_PHOTO.test(u)) ?? urls[0];
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
  const classifieds: string[] = [];
  const other: string[] = [];
  const consider = (raw: string): void => {
    const url = normalizeListingImageUrl(raw);
    if (!url) return;
    if (AVITO_LISTING_PHOTO.test(url)) classifieds.push(url);
    else other.push(url);
  };
  for (const img of Array.from(card.querySelectorAll('img'))) {
    for (const raw of urlsFromImg(img)) consider(raw);
  }
  for (const source of Array.from(card.querySelectorAll('source'))) {
    const srcset = source.getAttribute('srcset') ?? source.getAttribute('data-srcset') ?? '';
    consider(firstSrcsetUrl(srcset));
  }
  return classifieds[0] ?? other[0] ?? '';
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
  const id = rec['listId'] ?? rec['id'];
  const idKey =
    typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
  const imageCandidate = listingPhotoFromRecord(rec);
  if (idKey != null && imageCandidate) {
    const existing = into.get(idKey);
    into.set(idKey, preferListingPhoto(existing, imageCandidate) ?? imageCandidate);
  }
  for (const value of Object.values(rec)) walkForAvitoImages(value, into);
}

function listingPhotoFromRecord(rec: Record<string, unknown>): string | undefined {
  const classifieds: string[] = [];
  const other: string[] = [];
  const push = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) push(item);
      return;
    }
    const nestedUrl =
      value && typeof value === 'object' && 'url' in value
        ? (value as { url?: unknown }).url
        : undefined;
    const url =
      typeof value === 'string'
        ? normalizeListingImageUrl(value)
        : typeof nestedUrl === 'string'
          ? normalizeListingImageUrl(nestedUrl)
          : undefined;
    if (!url) return;
    if (AVITO_LISTING_PHOTO.test(url)) classifieds.push(url);
    else other.push(url);
  };
  push(rec['defaultImage']);
  push(rec['images']);
  push(rec['photos']);
  push(rec['imageUrl']);
  return classifieds[0] ?? other[0];
}
