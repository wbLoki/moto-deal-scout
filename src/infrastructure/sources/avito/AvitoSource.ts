import type { Logger } from 'pino';
import type { Page } from 'playwright-core';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import type { BrowserManager } from '../shared/BrowserManager.js';
import { crawlPages } from '../shared/crawl.js';
import {
  parseNumber,
  parseRelativeFrenchDate,
  parseYear,
  slugifyForAvito,
} from '../shared/textParsing.js';

const BASE_URL = 'https://www.avito.ma';
const DEFAULT_MAX_PAGES = 3;
/**
 * Avito's motorcycle category. It occupies the same path slot as a search
 * slug, so browsing the whole category and searching for one model differ
 * only in what goes here. Verified live: ~1400 listings, 38 cards per page.
 */
const CATEGORY_SLUG = 'motos_et_scooters';
/**
 * Avito's listing cards are styled-components with hashed class names that
 * churn across deploys, so this is the one selector we depend on: it's a
 * `data-testid` prefix, which is far more stable than `.sc-xxxx-y`.
 */
const CARD_SELECTOR = 'a[data-testid^="ad-card-v2-"]';

interface RawCard {
  href: string;
  title: string;
  year: string;
  mileage: string;
  image: string;
  price: string;
  city: string;
  relativeDate: string;
}

export interface AvitoSourceOptions {
  readonly throttleMs: number;
  readonly maxPages?: number;
}

/** Page 1 has no cursor; later pages carry `?o=N`. */
export function buildAvitoUrl(slug: string, page: number): string {
  return page === 1 ? `${BASE_URL}/fr/maroc/${slug}` : `${BASE_URL}/fr/maroc/${slug}?o=${page}`;
}

/**
 * Scrapes Avito.ma's "Motos & scooters" section. With a model it uses
 * Avito's own search box (`/fr/maroc/{slug}`), which does real full-text
 * matching, so we let it do the heavy lifting and treat the
 * {@link FuzzyModelMatcher} downstream as a confirmation pass rather than
 * the primary filter. Without a model it browses the whole category instead
 * — that's the discovery crawl.
 */
export class AvitoSource implements MarketplaceSource {
  readonly id = 'avito' as const;
  readonly name = 'Avito.ma';

  constructor(
    private readonly browserManager: BrowserManager,
    private readonly options: AvitoSourceOptions,
    private readonly logger: Logger,
  ) {}

  async fetchListings(query: SourceQuery): Promise<Listing[]> {
    const slug = query.criteria
      ? slugifyForAvito(`${query.criteria.brand} ${query.criteria.model}`)
      : CATEGORY_SLUG;
    const maxPages = query.maxPages ?? this.options.maxPages ?? DEFAULT_MAX_PAGES;

    const page = await this.browserManager.newPage();
    try {
      return await crawlPages({
        maxPages,
        throttleMs: this.options.throttleMs,
        fetchPage: (pageNumber) => this.scrapePage(page, buildAvitoUrl(slug, pageNumber)),
        onError: (err, pageNumber) =>
          this.logger.error({ err, slug, pageNumber }, 'Avito scrape failed'),
      });
    } finally {
      await page.close();
    }
  }

  dispose(): Promise<void> {
    // Browser lifecycle is owned by the shared PlaywrightBrowserManager.
    return Promise.resolve();
  }

  private async scrapePage(page: Page, url: string): Promise<Listing[]> {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(CARD_SELECTOR, { timeout: 10_000 }).catch(() => undefined);

    // Note: this callback is serialized and run inside the page, so it must
    // not reference any outer closures or named helper functions — under
    // tsx/esbuild's dev transform those get rewritten with a `__name(...)`
    // wrapper call that doesn't exist in the page's isolated JS context.
    const raw = await page.$$eval(CARD_SELECTOR, (cards): RawCard[] =>
      cards.map((card) => {
        const href = card.getAttribute('href') ?? '';
        const title = card.querySelector('h3')?.textContent?.trim() ?? '';
        const year = card.querySelector('span[title="Année-Modèle"]')?.textContent?.trim() ?? '';
        const mileage = card.querySelector('span[title="Kilométrage"]')?.textContent?.trim() ?? '';
        const image = card.querySelector('img')?.getAttribute('src') ?? '';

        // Price is two adjacent spans: an amount, then a literal "DH" unit.
        // The first such pair is the sale price; a second pair further down
        // ("518" + "DH/mois") is a financing estimate we don't want.
        const spans = Array.from(card.querySelectorAll('span'));
        let price = '';
        for (let i = 0; i < spans.length; i++) {
          const t = spans[i]?.textContent?.trim() ?? '';
          if (/^[\d][\d\s.,]*$/.test(t) && spans[i + 1]?.textContent?.trim() === 'DH') {
            price = t;
            break;
          }
        }

        // City has no stable attribute, but it's always the text immediately
        // before the "il y a ..." relative-date span, so anchor on that instead.
        const spanTexts = spans.map((s) => s.textContent?.trim() ?? '').filter(Boolean);
        const dateIndex = spanTexts.findIndex((t) => /^(il y a|aujourd'hui|hier)/i.test(t));
        const city = dateIndex > 0 ? (spanTexts[dateIndex - 1] ?? '') : '';
        const relativeDate = dateIndex >= 0 ? (spanTexts[dateIndex] ?? '') : '';

        return { href, title, year, mileage, image, price, city, relativeDate };
      }),
    );

    return raw
      .filter((r) => r.href && r.title && parseNumber(r.price) !== undefined)
      .map((r) => this.toListing(r));
  }

  private toListing(raw: RawCard): Listing {
    const externalId = /_(\d+)\.htm$/.exec(raw.href)?.[1] ?? raw.href;
    return {
      sourceId: this.id,
      externalId,
      url: raw.href,
      title: raw.title,
      description: undefined,
      // Presence of a parseable price was already checked by the filter above.
      priceMAD: parseNumber(raw.price)!,
      year: parseYear(raw.year),
      mileageKm: parseNumber(raw.mileage),
      city: raw.city || 'Maroc',
      imageUrl: raw.image || undefined,
      postedAt: parseRelativeFrenchDate(raw.relativeDate),
      scrapedAt: new Date(),
    };
  }
}
