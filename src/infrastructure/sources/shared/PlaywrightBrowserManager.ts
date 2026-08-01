import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Owns the single Chromium process shared by every Playwright-based
 * source. Sources ask for pages via {@link newPage}; they do not manage
 * browser/context lifecycle themselves. Call {@link close} once, at
 * process shutdown, after all sources are done.
 */
export class PlaywrightBrowserManager {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;

  constructor(private readonly headless: boolean) {}

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
    this.browser ??= await chromium.launch({ headless: this.headless });
    this.context ??= await this.browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      locale: 'fr-MA',
      viewport: { width: 1366, height: 900 },
    });
    return this.context;
  }
}
