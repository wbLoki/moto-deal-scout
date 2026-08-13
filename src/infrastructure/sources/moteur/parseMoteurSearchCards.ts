import { parseHTML } from 'linkedom';
import type { Listing } from '../../../domain/entities/Listing.js';
import { parseFuelType, parseGearbox } from '../../../domain/entities/VehicleType.js';
import { parseNumber, parseYear } from '../shared/textParsing.js';

const MOTEUR_ORIGIN = 'https://moteur.ma';
const DETAIL_HREF = /\/detail-annonce\/(\d+)\//i;
const HAS_LATIN = /[a-zA-Z]{2,}/;

/**
 * Maps Moteur.ma used-car search cards (`.ads-index-card`) onto {@link Listing}.
 * Cards are server-rendered — no browser needed.
 */
export function parseMoteurSearchCards(html: string, scrapedAt: Date = new Date()): Listing[] {
  const { document } = parseHTML(html);
  const cards = document.querySelectorAll('.ads-index-card');
  const listings: Listing[] = [];
  for (const card of cards) {
    const listing = listingFromCard(card, scrapedAt);
    if (listing) listings.push(listing);
  }
  return listings;
}

function listingFromCard(card: Element, scrapedAt: Date): Listing | undefined {
  const href =
    card.querySelector('a[href*="/detail-annonce/"]')?.getAttribute('href')?.trim() ?? '';
  const idMatch = DETAIL_HREF.exec(href);
  if (!idMatch?.[1]) return undefined;

  const heading = collapse(card.querySelector('.ads-index-title')?.textContent);
  const title = usableTitle(heading, href);
  const priceMAD = parseNumber(card.querySelector('.ad-price-grid')?.textContent);
  if (!title || priceMAD === undefined || priceMAD <= 0) return undefined;

  let year: number | undefined;
  let mileageKm: number | undefined;
  let fuelType = undefined as Listing['fuelType'];
  let gearbox = undefined as Listing['gearbox'];
  for (const span of card.querySelectorAll('.ad-meta span')) {
    const text = collapse(span.textContent);
    if (span.querySelector('.fa-calendar')) year ??= parseYear(text);
    else if (span.querySelector('.fa-road')) mileageKm ??= parseNumber(text);
    else if (span.querySelector('.fa-tachometer')) fuelType ??= parseFuelType(text);
    else if (span.querySelector('.fa-cog')) gearbox ??= parseGearbox(text);
  }

  let city = '';
  for (const a of card.querySelectorAll('.item-card9-desc a')) {
    if (a.querySelector('.fa-map-marker')) city = collapse(a.textContent);
  }

  const postedRaw = card.querySelector('.timeago')?.getAttribute('data-time')?.trim();
  const posted = parsePostedAt(postedRaw);
  const imgSrc = card.querySelector('.ads-index-media-img')?.getAttribute('src')?.trim();
  const description = collapse(card.querySelector('.ad-desc')?.textContent) || undefined;

  return {
    sourceId: 'moteur',
    externalId: idMatch[1],
    url: absoluteUrl(href),
    title,
    description,
    priceMAD,
    year,
    mileageKm,
    displacementCc: undefined,
    vehicleType: 'car',
    fuelType,
    gearbox,
    city: city || 'Maroc',
    imageUrl: imgSrc ? absoluteUrl(imgSrc) : undefined,
    postedAt: posted,
    scrapedAt,
  };
}

/**
 * Seller titles are often Arabic slogans ("للبيع موديل 2024"). The URL slug
 * (`audi-a5`) is what catalog matching actually needs in that case.
 */
function usableTitle(heading: string, href: string): string {
  const slug = /\/detail-annonce\/\d+\/([^/.]+)/i.exec(href)?.[1];
  const fromSlug = slug?.replace(/-/g, ' ').trim() ?? '';
  if (!HAS_LATIN.test(heading)) return fromSlug || heading;
  if (!fromSlug) return heading;
  const headingLower = heading.toLowerCase();
  const slugTokens = fromSlug.split(/\s+/).filter((t) => t.length >= 2);
  const overlap = slugTokens.some((t) => headingLower.includes(t));
  if (!overlap && slugTokens.length >= 2) return fromSlug;
  return heading;
}

function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** `data-time="2026-08-13 23:00:21"` has no timezone; treat as UTC so crawls are TZ-stable. */
function parsePostedAt(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const posted = new Date(raw.trim().replace(' ', 'T') + 'Z');
  return Number.isNaN(posted.getTime()) ? undefined : posted;
}

function absoluteUrl(href: string): string {
  try {
    return new URL(href, MOTEUR_ORIGIN).toString();
  } catch {
    return href;
  }
}
