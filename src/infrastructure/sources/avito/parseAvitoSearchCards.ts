import { parseHTML } from 'linkedom';
import type { Listing } from '../../../domain/entities/Listing.js';
import {
  parseNumber,
  parseRelativeFrenchDate,
  parseYear,
} from '../shared/textParsing.js';

/** Avito listing cards use a stable `data-testid` prefix (hashed class names churn). */
export const AVITO_CARD_SELECTOR = 'a[data-testid^="ad-card-v2-"]';

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
  const raw: AvitoRawCard[] = cards.map((card) => {
    const href = card.getAttribute('href') ?? '';
    const title = card.querySelector('h3')?.textContent?.trim() ?? '';
    const year = card.querySelector('span[title="Année-Modèle"]')?.textContent?.trim() ?? '';
    const mileage = card.querySelector('span[title="Kilométrage"]')?.textContent?.trim() ?? '';
    const image = card.querySelector('img')?.getAttribute('src') ?? '';

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
    .map((r) => rawCardToListing(r, scrapedAt));
}

export function rawCardToListing(raw: AvitoRawCard, scrapedAt: Date = new Date()): Listing {
  const href = raw.href.startsWith('http') ? raw.href : `https://www.avito.ma${raw.href}`;
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
    imageUrl: raw.image || undefined,
    postedAt: parseRelativeFrenchDate(raw.relativeDate),
    scrapedAt,
  };
}
