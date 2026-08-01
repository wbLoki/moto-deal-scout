import type { Logger } from 'pino';
import type { Page } from 'playwright';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import type { PlaywrightBrowserManager } from '../shared/PlaywrightBrowserManager.js';
import { delay } from '../shared/throttle.js';
import { parseNumber, parseYear, slugifyWithHyphens } from '../shared/textParsing.js';

const BASE_URL = 'https://www.biker.ma';
const DEFAULT_MAX_PAGES = 3;
const CARD_SELECTOR = '[data-id]';

interface RawCard {
  dataId: string;
  title: string;
  price: string;
  city: string;
  mileage: string;
  year: string;
  image: string;
}

export interface BikerSourceOptions {
  readonly throttleMs: number;
  readonly maxPages?: number;
}

/**
 * Scrapes Biker.ma's used-motorcycle search (`/annonce/moto`), which
 * supports a `modele` query param that does real substring/full-text
 * matching against listing titles.
 */
export class BikerSource implements MarketplaceSource {
  readonly id = 'biker' as const;
  readonly name = 'Biker.ma';

  constructor(
    private readonly browserManager: PlaywrightBrowserManager,
    private readonly options: BikerSourceOptions,
    private readonly logger: Logger,
  ) {}

  async fetchListings(query: SourceQuery): Promise<Listing[]> {
    const model = query.criteria.model;
    const maxPages = this.options.maxPages ?? DEFAULT_MAX_PAGES;
    const listings: Listing[] = [];

    const page = await this.browserManager.newPage();
    try {
      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
        const url = this.buildUrl(model, pageNumber);
        const pageListings = await this.scrapePage(page, url);
        if (pageListings.length === 0) break;
        listings.push(...pageListings);
        if (pageNumber < maxPages) await delay(this.options.throttleMs);
      }
    } catch (err) {
      this.logger.error({ err, model }, 'Biker.ma scrape failed');
    } finally {
      await page.close();
    }

    return listings;
  }

  dispose(): Promise<void> {
    // Browser lifecycle is owned by the shared PlaywrightBrowserManager.
    return Promise.resolve();
  }

  private buildUrl(model: string, page: number): string {
    const params = new URLSearchParams({
      marque: '',
      modele: model,
      prixmin: '',
      prixmax: '',
      ville: '',
      page: String(page),
      cylindreeMin: '',
      cylindreeMax: '',
    });
    return `${BASE_URL}/annonce/moto?${params.toString()}`;
  }

  private async scrapePage(page: Page, url: string): Promise<Listing[]> {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(CARD_SELECTOR, { timeout: 10_000 }).catch(() => undefined);

    const raw = await page.$$eval(CARD_SELECTOR, (cards): RawCard[] =>
      cards
        .filter((card) => card.querySelector('.custom-heading'))
        .map((card) => {
          const dataId = card.getAttribute('data-id') ?? '';
          const title = card.querySelector('.custom-heading')?.textContent?.trim() ?? '';
          const price = card.querySelector('.price-large-red')?.textContent?.trim() ?? '';
          const image = card.querySelector('.custom-card-img__img')?.getAttribute('src') ?? '';

          let city = '';
          let mileage = '';
          let year = '';
          card.querySelectorAll('.icon-text-block').forEach((block) => {
            const text = block.textContent?.trim() ?? '';
            if (block.querySelector('.bi-geo-alt')) city = text;
            else if (block.querySelector('.bi-speedometer2')) mileage = text;
            else if (block.querySelector('.bi-calendar')) year = text;
          });

          return { dataId, title, price, city, mileage, year, image };
        }),
    );

    return raw
      .filter((r) => r.dataId && r.title && parseNumber(r.price) !== undefined)
      .map((r) => this.toListing(r));
  }

  private toListing(raw: RawCard): Listing {
    const slug = slugifyWithHyphens(raw.title) || 'moto';
    return {
      sourceId: this.id,
      externalId: raw.dataId,
      url: `${BASE_URL}/annonce/detail-moto/${slug}/${raw.dataId}`,
      title: raw.title,
      description: undefined,
      // Presence of a parseable price was already checked by the filter above.
      priceMAD: parseNumber(raw.price)!,
      year: parseYear(raw.year),
      mileageKm: parseNumber(raw.mileage),
      city: raw.city || 'Maroc',
      imageUrl: raw.image || undefined,
      postedAt: undefined,
      scrapedAt: new Date(),
    };
  }
}
