import type { Logger } from 'pino';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import type { RenderedHtmlFetcher } from '../../browser/RenderedHtmlFetcher.js';
import { crawlPages } from '../shared/crawl.js';
import { slugifyForAvito } from '../shared/textParsing.js';
import {
  AVITO_CARD_SELECTOR,
  parseAvitoSearchCards,
} from './parseAvitoSearchCards.js';

const BASE_URL = 'https://www.avito.ma';
const DEFAULT_MAX_PAGES = 3;
/**
 * Avito's motorcycle category. It occupies the same path slot as a search
 * slug, so browsing the whole category and searching for one model differ
 * only in what goes here. Verified live: ~1400 listings, 38 cards per page.
 */
const CATEGORY_SLUG = 'motos_et_scooters';

export interface AvitoSourceOptions {
  readonly throttleMs: number;
  readonly maxPages?: number;
}

/** Page 1 has no cursor; later pages carry `?o=N`. */
export function buildAvitoUrl(slug: string, page: number): string {
  return page === 1 ? `${BASE_URL}/fr/maroc/${slug}` : `${BASE_URL}/fr/maroc/${slug}?o=${page}`;
}

/**
 * Scrapes Avito.ma's "Motos & scooters" section via rendered HTML (Cloudflare
 * Browser Rendering on GHA/Workers, or Playwright locally). With a model it
 * uses Avito's search slug; without a model it browses the whole category.
 */
export class AvitoSource implements MarketplaceSource {
  readonly id = 'avito' as const;
  readonly name = 'Avito.ma';

  constructor(
    private readonly htmlFetcher: RenderedHtmlFetcher,
    private readonly options: AvitoSourceOptions,
    private readonly logger: Logger,
  ) {}

  async fetchListings(query: SourceQuery): Promise<Listing[]> {
    const slug = query.criteria
      ? slugifyForAvito(`${query.criteria.brand} ${query.criteria.model}`)
      : CATEGORY_SLUG;
    const maxPages = query.maxPages ?? this.options.maxPages ?? DEFAULT_MAX_PAGES;

    return crawlPages({
      maxPages,
      throttleMs: this.options.throttleMs,
      ...(query.postedAfter ? { postedAfter: query.postedAfter } : {}),
      fetchPage: (pageNumber) => this.scrapePage(buildAvitoUrl(slug, pageNumber)),
      onError: (err, pageNumber) =>
        this.logger.error({ err, slug, pageNumber }, 'Avito scrape failed'),
    });
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  private async scrapePage(url: string): Promise<Listing[]> {
    const html = await this.htmlFetcher.fetchRenderedHtml(url, {
      waitForSelector: AVITO_CARD_SELECTOR,
      timeoutMs: 30_000,
    });
    return parseAvitoSearchCards(html);
  }
}
