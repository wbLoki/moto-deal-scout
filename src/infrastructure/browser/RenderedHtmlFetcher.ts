/** Options for loading a URL into a headless browser and returning HTML. */
export interface RenderHtmlOptions {
  /** CSS selector that must appear before capture (e.g. `#__NEXT_DATA__`). */
  readonly waitForSelector?: string;
  /** Navigation / wait timeout in ms (default 30_000). */
  readonly timeoutMs?: number;
  /**
   * Navigation completion signal. `domcontentloaded` is fastest but may miss
   * client-rendered content; `networkidle2` waits for the page's JS/XHRs to
   * settle, which also gives a JS bot-check (Datadome) time to run. Default
   * `domcontentloaded`.
   */
  readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  /** Override the browser User-Agent — a real Chrome UA is less bot-flagged. */
  readonly userAgent?: string;
  /** Extra request headers (e.g. `Accept-Language`) sent with every request. */
  readonly extraHeaders?: Record<string, string>;
}

/**
 * Fetches fully rendered HTML (after JS) for a URL.
 * Implementations: Cloudflare Browser Rendering (Workers binding / REST) or local Playwright.
 */
export interface RenderedHtmlFetcher {
  fetchRenderedHtml(url: string, options?: RenderHtmlOptions): Promise<string>;
}

/** Daily Free-plan Browser Rendering budget exhausted (HTTP 429 / time limit). */
export class BrowserRenderingQuotaError extends Error {
  override readonly name = 'BrowserRenderingQuotaError';
  constructor(message = 'Cloudflare Browser Rendering daily quota exceeded.') {
    super(message);
  }
}

export function isBrowserRenderingQuotaError(err: unknown): boolean {
  return (
    err instanceof BrowserRenderingQuotaError ||
    (err instanceof Error && err.name === 'BrowserRenderingQuotaError')
  );
}
