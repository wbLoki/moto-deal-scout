import type { Logger } from 'pino';
import type { Page } from 'playwright-core';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import type { BrowserManager } from '../shared/BrowserManager.js';
import { crawlPages } from '../shared/crawl.js';
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
 * Builds a Biker.ma search URL. Every filter except `modele` is already sent
 * empty by design, so an empty `modele` too is simply an unfiltered browse of
 * the whole used-motorcycle category — that's the discovery crawl.
 */
export function buildBikerUrl(model: string, page: number): string {
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

/**
 * Scrapes Biker.ma's used-motorcycle search (`/annonce/moto`), which
 * supports a `modele` query param that does real substring/full-text
 * matching against listing titles.
 */
export class BikerSource implements MarketplaceSource {
  readonly id = 'biker' as const;
  readonly name = 'Biker.ma';

  constructor(
    private readonly browserManager: BrowserManager,
    private readonly options: BikerSourceOptions,
    private readonly logger: Logger,
  ) {}

  async fetchListings(query: SourceQuery): Promise<Listing[]> {
    // No model means browse the entire category (discovery crawl).
    const model = query.criteria?.model ?? '';
    const maxPages = query.maxPages ?? this.options.maxPages ?? DEFAULT_MAX_PAGES;

    const page = await this.browserManager.newPage();
    try {
      return await crawlPages({
        maxPages,
        throttleMs: this.options.throttleMs,
        fetchPage: (pageNumber) => this.scrapePage(page, buildBikerUrl(model, pageNumber)),
        onError: (err, pageNumber) =>
          this.logger.error({ err, model, pageNumber }, 'Biker.ma scrape failed'),
      });
    } finally {
      await page.close();
    }
  }

  /**
   * Fills in `postedAt` and `displacementCc`, which the search cards omit — only
   * the detail record carries the publish date and engine size. Biker.ma's own
   * detail view is an Angular page that fetches `/api/v1/moto/detail/{id}`, so we
   * hit that JSON endpoint directly (its `dateajout` is a clean ISO timestamp,
   * `cylindre` the displacement in cc) rather than rendering a browser page. The
   * scanner calls this only for listings it hasn't stored yet. Any failure
   * returns the listing untouched: a missing field must never drop it.
   */
  async enrich(listing: Listing): Promise<Listing> {
    if (listing.postedAt && listing.displacementCc !== undefined) return listing;

    try {
      await delay(this.options.throttleMs);
      const res = await fetch(`${BASE_URL}/api/v1/moto/detail/${listing.externalId}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return listing;
      const data = (await res.json()) as { dateajout?: string; cylindre?: string | number };
      const posted = data.dateajout ? new Date(data.dateajout) : undefined;
      const postedAt = posted && !Number.isNaN(posted.getTime()) ? posted : listing.postedAt;
      // Sellers occasionally enter nonsense ("2", "99999") — keep only plausible
      // displacements, else leave it unknown so it can't skew the cc filter.
      const cc = parseNumber(String(data.cylindre ?? ''));
      const displacementCc = cc && cc >= 25 && cc <= 3500 ? cc : listing.displacementCc;
      return { ...listing, postedAt, displacementCc };
    } catch (err) {
      this.logger.warn({ err, externalId: listing.externalId }, 'Biker.ma detail enrich failed');
      return listing;
    }
  }

  dispose(): Promise<void> {
    // Browser lifecycle is owned by the shared PlaywrightBrowserManager.
    return Promise.resolve();
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
      // Displacement (and the post date) live only on the detail record — see enrich().
      displacementCc: undefined,
      city: raw.city || 'Maroc',
      imageUrl: raw.image || undefined,
      postedAt: undefined,
      scrapedAt: new Date(),
    };
  }
}
