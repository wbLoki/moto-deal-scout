import type { Logger } from 'pino';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import { crawlPages } from '../shared/crawl.js';
import { parseMoteurSearchCards } from './parseMoteurSearchCards.js';

const BASE_URL = 'https://moteur.ma';
const LIST_PATH = '/fr/voiture/achat-voiture-occasion';
const DEFAULT_MAX_PAGES = 8;

const MOTEUR_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export interface MoteurSourceOptions {
  readonly throttleMs: number;
  readonly maxPages?: number;
}

/**
 * Page 1 is the category index; later pages carry `?page=N` (newest first).
 * Exported for unit tests.
 */
export function buildMoteurUrl(page: number): string {
  if (page <= 1) return `${BASE_URL}${LIST_PATH}/`;
  return `${BASE_URL}${LIST_PATH}?page=${page}`;
}

/**
 * Scrapes Moteur.ma used-car listings from the server-rendered HTML list
 * (`/fr/voiture/achat-voiture-occasion/`). No browser needed. Car crawls run
 * on the same residential box as Avito (not GitHub Actions).
 *
 * Brand/model search is unreliable on the public form, so a criteria query
 * still browses the category and filters titles client-side. Discovery (no
 * criteria) returns the full crawl.
 */
export class MoteurSource implements MarketplaceSource {
  readonly id = 'moteur' as const;
  readonly name = 'Moteur.ma';

  constructor(
    private readonly options: MoteurSourceOptions,
    private readonly logger: Logger,
  ) {}

  async fetchListings(query: SourceQuery): Promise<Listing[]> {
    const maxPages = query.maxPages ?? this.options.maxPages ?? DEFAULT_MAX_PAGES;
    const listings = await crawlPages({
      maxPages,
      throttleMs: this.options.throttleMs,
      ...(query.postedAfter ? { postedAfter: query.postedAfter } : {}),
      ...(query.seenBefore ? { seenBefore: query.seenBefore } : {}),
      fetchPage: (pageNumber) => this.fetchPage(buildMoteurUrl(pageNumber)),
      onError: (err, pageNumber) =>
        this.logger.error({ err, pageNumber }, 'Moteur.ma scrape failed'),
    });
    if (!query.criteria) return listings;
    const brand = query.criteria.brand.toLowerCase();
    const model = query.criteria.model.toLowerCase();
    return listings.filter((listing) => {
      const title = listing.title.toLowerCase();
      return title.includes(brand) || title.includes(model);
    });
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  private async fetchPage(url: string): Promise<Listing[]> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': MOTEUR_USER_AGENT,
        'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      throw new Error(`Moteur.ma HTTP ${res.status} for ${url}`);
    }
    const html = await res.text();
    return parseMoteurSearchCards(html, new Date());
  }
}
