import chromium from '@sparticuz/chromium';
import {
  chromium as playwright,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright-core';
import type { BrowserManager } from './BrowserManager.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Serverless {@link BrowserManager} for Vercel/AWS Lambda. Uses
 * `playwright-core` (no bundled browsers) driving the Chromium binary that
 * `@sparticuz/chromium` unpacks from the Lambda layer at runtime. Behaves
 * identically to the local manager from a source's point of view.
 */
export class ServerlessPlaywrightBrowserManager implements BrowserManager {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;

  async newPage(): Promise<Page> {
    const context = await this.getContext();
    return context.newPage();
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = undefined;
    this.browser = undefined;
  }

  private async getContext(): Promise<BrowserContext> {
    if (!this.browser) {
      this.browser = await playwright.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    }
    this.context ??= await this.browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      locale: 'fr-MA',
      viewport: { width: 1366, height: 900 },
    });
    return this.context;
  }
}
