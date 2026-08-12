import type { Logger } from 'pino';
import type { Listing } from '../../../domain/entities/Listing.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../../domain/interfaces/MarketplaceSource.js';
import type { RenderedHtmlFetcher } from '../../browser/RenderedHtmlFetcher.js';
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

/**
 * Markers of a bot-wall interstitial served instead of listings. Avito sits
 * behind Cloudflare, whose "Just a moment…" challenge is what Browser Rendering
 * hits from datacenter IPs; the Datadome patterns are kept in case that changes.
 */
const BOT_CHALLENGE_MARKERS =
  /just a moment|cf-browser-verification|challenge-platform|__cf_chl|cf_chlenge|turnstile|attention required|datadome|captcha-delivery|verify you are (a )?human/i;
/**
 * Avito's "Motos à vendre" category. It occupies the same path slot as a
 * search slug, so browsing the whole category and searching for one model
 * differ only in what goes here. Prefer this over `motos_et_scooters` — that
 * older browse path misses ads that only appear under motos-à_vendre.
 */
const CATEGORY_SLUG = 'motos-à_vendre';

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
    // A single fast load (a real Chrome UA + fr-MA headers). We deliberately do
    // NOT wait for network-idle: from datacenter IPs Avito's Cloudflare wall
    // serves a "Just a moment…" challenge whose network never settles, so idle
    // just burns the Free-plan browser budget and 401s. If we ever get the real
    // page, its cards are in the initial HTML; if not, we detect the challenge.
    const html = await this.htmlFetcher.fetchRenderedHtml(url, {
      waitUntil: 'domcontentloaded',
      timeoutMs: 30_000,
      userAgent: AVITO_USER_AGENT,
      extraHeaders: AVITO_HEADERS,
    });
    const cards = parseAvitoSearchCards(html);
    if (cards.length === 0) {
      const blocked = BOT_CHALLENGE_MARKERS.test(html);
      this.logger.warn(
        { url, htmlLength: html.length, likelyBlocked: blocked, snippet: html.slice(0, 300) },
        blocked
          ? 'Avito served a bot challenge (Cloudflare) — needs a residential runner'
          : 'Avito returned no cards',
      );
    }
    return cards;
  }
}
