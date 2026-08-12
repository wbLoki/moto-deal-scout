import type { BrowserManager } from '../sources/shared/BrowserManager.js';
import {
  RestBrowserHtmlFetcher,
  tryGetWorkersBrowserBinding,
  WorkersBrowserHtmlFetcher,
} from './cloudflareRenderedHtml.js';
import type { RenderedHtmlFetcher } from './RenderedHtmlFetcher.js';

export interface CreateRenderedHtmlFetcherOptions {
  /** Cloudflare account id for the Browser Rendering REST API (GHA / local). */
  readonly cloudflareAccountId?: string | undefined;
  /** API token with Browser Rendering - Edit (GHA / local). */
  readonly cloudflareApiToken?: string | undefined;
  /**
   * Prefer Playwright even when REST creds exist (residential laptop/Pi).
   * Ignored when a Workers binding is available.
   */
  readonly preferPlaywright?: boolean | undefined;
  /**
   * Shared Chromium for Playwright fetches (same instance as Biker). Only
   * used when Playwright is selected.
   */
  readonly browserManager?: BrowserManager | undefined;
}

/**
 * Picks the best HTML fetcher for this runtime:
 * 1. Workers `BROWSER` binding (compare on Cloudflare)
 * 2. REST Browser Rendering when account + token are set and Playwright is not preferred
 * 3. Local Playwright (CLI on a residential machine with Chromium) — dynamic
 *    import so OpenNext never statically pulls playwright into the Worker graph.
 */
export async function createRenderedHtmlFetcher(
  options: CreateRenderedHtmlFetcherOptions = {},
): Promise<RenderedHtmlFetcher> {
  const binding = await tryGetWorkersBrowserBinding();
  if (binding) return new WorkersBrowserHtmlFetcher(binding);

  if (
    !options.preferPlaywright &&
    options.cloudflareAccountId &&
    options.cloudflareApiToken
  ) {
    return new RestBrowserHtmlFetcher(options.cloudflareAccountId, options.cloudflareApiToken);
  }

  const { PlaywrightHtmlFetcher } = await import('./playwrightRenderedHtml.js');
  return new PlaywrightHtmlFetcher(options.browserManager);
}
