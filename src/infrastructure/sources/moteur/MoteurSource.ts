import type { Logger } from 'pino';
import type { Page } from 'playwright-core';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import type { BrowserManager } from '../shared/BrowserManager.js';
import { delay } from '../shared/throttle.js';
import { parseNumber, parseYear } from '../shared/textParsing.js';

const BASE_URL = 'https://www.moteur.ma';
const DEFAULT_MAX_PAGES = 3;
const CARD_SELECTOR = '.ads-index-card';

interface RawCard {
  url: string;
  title: string;
  price: string;
  city: string;
  mileage: string;
  year: string;
  postedAtRaw: string;
  image: string;
}

export interface MoteurSourceOptions {
  readonly throttleMs: number;
  readonly maxPages?: number;
}

/**
 * Scrapes Moteur.ma's used-motorcycle section
 * (`/fr/moto/achat-moto-occasion/`). Despite reusing the car site's
 * brand/model filter widget (which lists car brands, not moto ones), the
 * underlying `marque`/`modele` query params do filter motorcycle listings
 * correctly by free text — verified against live search results.
 */
export class MoteurSource implements MarketplaceSource {
  readonly id = 'moteur' as const;
  readonly name = 'Moteur.ma';

  constructor(
    private readonly browserManager: BrowserManager,
    private readonly options: MoteurSourceOptions,
    private readonly logger: Logger,
  ) {}

  async fetchListings(query: SourceQuery): Promise<Listing[]> {
    const { brand, model } = query.criteria;
    const maxPages = this.options.maxPages ?? DEFAULT_MAX_PAGES;
    const listings: Listing[] = [];

    const page = await this.browserManager.newPage();
    try {
      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
        const url = this.buildUrl(brand, model, pageNumber);
        const pageListings = await this.scrapePage(page, url);
        if (pageListings.length === 0) break;
        listings.push(...pageListings);
        if (pageNumber < maxPages) await delay(this.options.throttleMs);
      }
    } catch (err) {
      this.logger.error({ err, brand, model }, 'Moteur.ma scrape failed');
    } finally {
      await page.close();
    }

    return listings;
  }

  dispose(): Promise<void> {
    // Browser lifecycle is owned by the shared PlaywrightBrowserManager.
    return Promise.resolve();
  }

  private buildUrl(brand: string, model: string, page: number): string {
    const params = new URLSearchParams({ marque: brand, modele: model, page: String(page) });
    return `${BASE_URL}/fr/moto/achat-moto-occasion/?${params.toString()}`;
  }

  private async scrapePage(page: Page, url: string): Promise<Listing[]> {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(CARD_SELECTOR, { timeout: 10_000 }).catch(() => undefined);

    const raw = await page.$$eval(CARD_SELECTOR, (cards): RawCard[] =>
      cards.map((card) => {
        const detailLink = card.querySelector('a[href*="/detail-annonce/"]');
        const url = detailLink?.getAttribute('href') ?? '';
        const title = card.querySelector('.ads-index-title')?.textContent?.trim() ?? '';
        const price = card.querySelector('.ad-price-grid')?.textContent?.trim() ?? '';
        const image = card.querySelector('.ads-index-media-img')?.getAttribute('src') ?? '';
        const postedAtRaw = card.querySelector('.timeago')?.getAttribute('data-time') ?? '';

        let city = '';
        card.querySelectorAll('.item-card9-desc a').forEach((a) => {
          if (a.querySelector('.fa-map-marker')) city = a.textContent?.trim() ?? '';
        });

        let year = '';
        let mileage = '';
        card.querySelectorAll('.ad-meta span').forEach((span) => {
          if (span.querySelector('.fa-calendar')) year = span.textContent?.trim() ?? '';
          else if (span.querySelector('.fa-road')) mileage = span.textContent?.trim() ?? '';
        });

        return { url, title, price, city, mileage, year, postedAtRaw, image };
      }),
    );

    return raw
      .filter((r) => r.url && r.title && parseNumber(r.price) !== undefined)
      .map((r) => this.toListing(r));
  }

  private toListing(raw: RawCard): Listing {
    const url = raw.url.startsWith('http') ? raw.url : `${BASE_URL}${raw.url}`;
    const externalId = /\/detail-annonce\/(\d+)\//.exec(url)?.[1] ?? url;
    const postedAt = raw.postedAtRaw ? new Date(raw.postedAtRaw.replace(' ', 'T')) : undefined;

    return {
      sourceId: this.id,
      externalId,
      url,
      title: raw.title,
      description: undefined,
      // Presence of a parseable price was already checked by the filter above.
      priceMAD: parseNumber(raw.price)!,
      year: parseYear(raw.year),
      mileageKm: parseNumber(raw.mileage),
      city: raw.city || 'Maroc',
      imageUrl: raw.image || undefined,
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
      scrapedAt: new Date(),
    };
  }
}
