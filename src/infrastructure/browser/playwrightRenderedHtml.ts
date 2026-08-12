import type { Page } from 'playwright-core';
import type { BrowserManager } from '../sources/shared/BrowserManager.js';
import type { RenderedHtmlFetcher, RenderHtmlOptions } from './RenderedHtmlFetcher.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Local Chromium via Playwright. Node/CLI only — never import this from the
 * OpenNext Worker graph (playwright-core breaks the Cloudflare esbuild step).
 *
 * Prefer injecting a shared {@link BrowserManager} (same Chromium as Biker) so
 * a Pi/laptop only keeps one browser process. Without a manager, each fetch
 * launches and closes its own Chromium (heavier fallback).
 */
export class PlaywrightHtmlFetcher implements RenderedHtmlFetcher {
  constructor(private readonly browserManager?: BrowserManager) {}

  async fetchRenderedHtml(url: string, options: RenderHtmlOptions = {}): Promise<string> {
    if (this.browserManager) {
      return this.fetchWithSharedBrowser(url, options);
    }
    return this.fetchWithOneShotBrowser(url, options);
  }

  private async fetchWithSharedBrowser(
    url: string,
    options: RenderHtmlOptions,
  ): Promise<string> {
    const page = await this.browserManager!.newPage();
    try {
      if (options.extraHeaders) {
        await page.setExtraHTTPHeaders(options.extraHeaders);
      }
      return await renderPage(page, url, options);
    } finally {
      await page.close();
    }
  }

  private async fetchWithOneShotBrowser(
    url: string,
    options: RenderHtmlOptions,
  ): Promise<string> {
    const playwright = await import('playwright');
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
        locale: 'fr-MA',
        ...(options.extraHeaders ? { extraHTTPHeaders: options.extraHeaders } : {}),
      });
      return await renderPage(page, url, options);
    } finally {
      await browser.close();
    }
  }
}

async function renderPage(
  page: Page,
  url: string,
  options: RenderHtmlOptions,
): Promise<string> {
  const timeout = options.timeoutMs ?? 30_000;
  // Playwright spells network-idle 'networkidle' (Puppeteer uses networkidle0/2).
  const waitUntil =
    options.waitUntil === 'networkidle0' || options.waitUntil === 'networkidle2'
      ? 'networkidle'
      : (options.waitUntil ?? 'domcontentloaded');
  await page.goto(url, { waitUntil, timeout });
  if (options.waitForSelector) {
    await page
      .waitForSelector(options.waitForSelector, { state: 'attached', timeout })
      .catch(() => undefined);
  }
  return page.content();
}
