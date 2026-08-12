import type { Listing } from '../../../domain/entities/Listing.js';
import { delay } from './throttle.js';

export interface CrawlOptions {
  /** Hard cap on pages fetched, whatever the dedupe logic decides. */
  readonly maxPages: number;
  /** Pause between page fetches, to stay polite. */
  readonly throttleMs: number;
  /** Fetches one page of listings by 1-based page number. */
  readonly fetchPage: (pageNumber: number) => Promise<Listing[]>;
  /**
   * Called when a page fetch throws, including on an attempt that is about to
   * be retried. After the retries are used up the crawl stops and returns what
   * it collected so far, so one bad page late in a long discovery crawl
   * doesn't discard everything before it.
   */
  readonly onError?: (err: unknown, pageNumber: number) => void;
  /**
   * Extra attempts per page before giving up. Marketplaces intermittently
   * stall on a single page under a long crawl, and losing the remaining
   * pages to one 30s timeout is a poor trade.
   */
  readonly retries?: number;
  /**
   * Incremental watermark: skip listings posted on or before this date, and
   * stop once a whole page falls below it. Because the marketplace lists
   * newest-first, everything past that point is older than our last scrape, so
   * re-crawling it is wasted work. Listings with no post date are treated as
   * recent (never trimmed), so a source whose cards omit the date — Biker,
   * where the date arrives later via enrich() — is unaffected. Undefined runs
   * a full crawl (first run, or a forced re-crawl).
   */
  readonly postedAfter?: Date;
  /**
   * "Do we already have this listing?" check. Lets a source whose cards carry
   * no post date — Biker — stop paginating once it reaches a page that is
   * *entirely* already stored: the marketplace is newest-first, so everything
   * below a fully-seen page is older and already ours. This is the date-less
   * counterpart to {@link postedAfter}. It only decides *when to stop*, not
   * which listings come back — already-seen listings on a fetched page are
   * still returned, so price-drop detection keeps working. Undefined disables
   * the check (first run, or a source that relies on postedAfter).
   */
  readonly seenBefore?: (listing: Listing) => Promise<boolean>;
}

/**
 * Walks a paginated listing category, stopping at `maxPages` or as soon as a
 * page contributes nothing we haven't already collected.
 *
 * "Contributed no new listings" is the end-of-category signal, deliberately —
 * the two obvious alternatives are both wrong against the live sites. Avito
 * pins the same three sponsored ads to the top of *every* page in rotating
 * order, and past the last real page it serves those pinned ads *only*. So an
 * empty page never arrives, and comparing the first card against the previous
 * page's first card misfires on page 2 and truncates the crawl immediately.
 *
 * Deduping by `externalId` also stops those pinned ads (and Avito's habit of
 * showing a promoted ad twice on one page, once in its natural position) from
 * being processed once per page.
 */
/** One page, retried on failure. Undefined once every attempt has failed. */
async function fetchWithRetries(
  opts: CrawlOptions,
  pageNumber: number,
): Promise<Listing[] | undefined> {
  const attempts = (opts.retries ?? 1) + 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await opts.fetchPage(pageNumber);
    } catch (err) {
      opts.onError?.(err, pageNumber);
      // Browser Rendering Free quota — do not burn retries; abort the crawl.
      if (
        err instanceof Error &&
        (err.name === 'BrowserRenderingQuotaError' || /quota exceeded|time limit/i.test(err.message))
      ) {
        throw err;
      }
      // Back off before retrying; a stalled page is often busy, not broken.
      if (attempt < attempts) await delay(opts.throttleMs);
    }
  }
  return undefined;
}

export async function crawlPages(opts: CrawlOptions): Promise<Listing[]> {
  const seen = new Set<string>();
  const collected: Listing[] = [];

  for (let pageNumber = 1; pageNumber <= opts.maxPages; pageNumber++) {
    const pageListings = await fetchWithRetries(opts, pageNumber);
    if (pageListings === undefined) break;

    // Marking each id as seen inside the loop also collapses duplicates
    // *within* a page — Avito shows a promoted ad both in its pinned slot and
    // again in its natural position, so a 38-card page can carry 35 ads.
    const fresh: Listing[] = [];
    for (const listing of pageListings) {
      if (seen.has(listing.externalId)) continue;
      seen.add(listing.externalId);
      fresh.push(listing);
    }
    if (fresh.length === 0) break;

    // Incremental crawl: keep only listings newer than the watermark, and stop
    // once a whole page is older — everything after it is older still. We check
    // "the whole page is old", not "the first old card", because marketplaces
    // pin old sponsored ads to the top; one such card must not truncate a crawl
    // that still has fresh listings below it.
    const recent = opts.postedAfter
      ? fresh.filter((l) => l.postedAt === undefined || l.postedAt > opts.postedAfter!)
      : fresh;
    collected.push(...recent);
    if (opts.postedAfter && recent.length === 0) break;

    // Date-less sources (Biker): stop once a whole page is already stored —
    // newest-first means nothing new remains below it. Checked on `fresh` (the
    // deduped page), and only after `recent` is collected, so already-seen
    // listings are still returned for price-drop detection.
    if (opts.seenBefore) {
      const alreadyStored = await Promise.all(fresh.map((l) => opts.seenBefore!(l)));
      if (alreadyStored.every(Boolean)) break;
    }

    if (pageNumber < opts.maxPages) await delay(opts.throttleMs);
  }

  return collected;
}
