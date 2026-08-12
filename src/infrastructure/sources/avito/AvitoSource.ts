import type { Logger } from 'pino';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import {
  isBrowserRenderingQuotaError,
  type RenderedHtmlFetcher,
} from '../../browser/RenderedHtmlFetcher.js';
import { crawlPages } from '../shared/crawl.js';
import { slugifyForAvito } from '../shared/textParsing.js';
import { parseAvitoSearchCards } from './parseAvitoSearchCards.js';

const BASE_URL = 'https://www.avito.ma';
const DEFAULT_MAX_PAGES = 3;

/** A current desktop Chrome UA — the default headless UA is an easy bot tell. */
const AVITO_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Headers a real fr-MA browser sends; helps a bot-check treat us as human. */
const AVITO_HEADERS: Record<string, string> = {
  'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

/** Markers that identify Datadome's bot-wall / CAPTCHA challenge in the HTML. */
const DATADOME_MARKERS =
  /datadome|captcha-delivery|geo\.captcha-delivery|interstitial|dd_cookie|verify you are (a )?human|access denied/i;
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
    // `options.maxPages` (AVITO_MAX_PAGES) is a hard ceiling, not just a default:
    // Avito goes through rate-limited Cloudflare Browser Rendering (Free plan),
    // so a deep discovery crawl (query.maxPages of 20-40) must not run 40 browser
    // requests here. When the cap is unset (local Playwright), the request wins.
    const requested = query.maxPages ?? this.options.maxPages ?? DEFAULT_MAX_PAGES;
    const maxPages =
      this.options.maxPages !== undefined
        ? Math.min(requested, this.options.maxPages)
        : requested;

    return crawlPages({
      maxPages,
      throttleMs: this.options.throttleMs,
      ...(query.postedAfter ? { postedAfter: query.postedAfter } : {}),
      ...(query.seenBefore ? { seenBefore: query.seenBefore } : {}),
      fetchPage: (pageNumber) => this.scrapePage(buildAvitoUrl(slug, pageNumber)),
      onError: (err, pageNumber) =>
        this.logger.error({ err, slug, pageNumber }, 'Avito scrape failed'),
    });
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  private async scrapePage(url: string): Promise<Listing[]> {
    const html = await this.fetchAvitoHtml(url);
    const cards = parseAvitoSearchCards(html);
    if (cards.length === 0) {
      // Zero cards on a 200 means either an empty page past the last one, or —
      // the reason to log — Avito's Datadome bot-wall served a challenge instead
      // of listings. The snippet makes that unambiguous in the run logs.
      const likelyBlocked = DATADOME_MARKERS.test(html);
      this.logger.warn(
        { url, htmlLength: html.length, likelyBlocked, snippet: html.slice(0, 400) },
        likelyBlocked ? 'Avito appears bot-blocked (Datadome challenge)' : 'Avito returned no cards',
      );
    }
    return cards;
  }

  /**
   * Fetches Avito's rendered HTML, mirroring the local Playwright behaviour that
   * already works: no *fatal* selector wait (the Browser Rendering REST API 422s
   * when a `waitForSelector` times out, unlike Playwright's soft wait). Instead
   * we wait for the network to settle so the client-rendered cards — and any
   * Datadome JS check — have time to run, sending a real Chrome UA + French
   * headers to look less like a bot. If that hangs on a challenge page (never
   * idle), we fall back to the initial HTML so we still parse and can diagnose.
   */
  private async fetchAvitoHtml(url: string): Promise<string> {
    const common = {
      timeoutMs: 30_000,
      userAgent: AVITO_USER_AGENT,
      extraHeaders: AVITO_HEADERS,
    } as const;
    try {
      return await this.htmlFetcher.fetchRenderedHtml(url, { ...common, waitUntil: 'networkidle2' });
    } catch (err) {
      if (isBrowserRenderingQuotaError(err)) throw err;
      this.logger.warn({ err, url }, 'Avito networkidle fetch failed; retrying for raw HTML');
      return this.htmlFetcher.fetchRenderedHtml(url, { ...common, waitUntil: 'domcontentloaded' });
    }
  }
}
