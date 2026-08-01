import type { Page } from 'playwright-core';

/**
 * Hands out browser pages to the marketplace sources and owns the
 * underlying browser/context lifecycle. Sources depend on this interface,
 * not a concrete class, so the same source code runs against a local
 * Chromium (dev/CLI) and a serverless Chromium (Vercel).
 */
export interface BrowserManager {
  /** Open a fresh page in the shared browser context. */
  newPage(): Promise<Page>;

  /** Tear down the browser and context. Safe to call multiple times. */
  close(): Promise<void>;
}
