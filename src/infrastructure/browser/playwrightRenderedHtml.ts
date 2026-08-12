import type { RenderedHtmlFetcher, RenderHtmlOptions } from './RenderedHtmlFetcher.js';

/**
 * Local Chromium via Playwright. Node/CLI only — never import this from the
 * OpenNext Worker graph (playwright-core breaks the Cloudflare esbuild step).
 */
export class PlaywrightHtmlFetcher implements RenderedHtmlFetcher {
  async fetchRenderedHtml(url: string, options: RenderHtmlOptions = {}): Promise<string> {
    const playwright = await import('playwright');
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        userAgent:
          options.userAgent ??
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        locale: 'fr-MA',
        ...(options.extraHeaders ? { extraHTTPHeaders: options.extraHeaders } : {}),
      });
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
      return await page.content();
    } finally {
      await browser.close();
    }
  }
}
