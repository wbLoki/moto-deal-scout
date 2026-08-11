import {
  BrowserRenderingQuotaError,
  type RenderedHtmlFetcher,
  type RenderHtmlOptions,
} from './RenderedHtmlFetcher.js';

/** Minimal shape of the Workers `browser` binding Quick Actions API. */
export interface BrowserRenderingBinding {
  quickAction(
    action: 'content',
    payload: Record<string, unknown>,
  ): Promise<Response>;
}

interface ContentApiEnvelope {
  readonly success?: boolean;
  readonly result?: string;
  readonly errors?: readonly { readonly message?: string }[];
}

function contentPayload(url: string, options: RenderHtmlOptions = {}): Record<string, unknown> {
  const timeout = options.timeoutMs ?? 30_000;
  const payload: Record<string, unknown> = {
    url,
    gotoOptions: {
      waitUntil: 'domcontentloaded',
      timeout,
    },
  };
  if (options.waitForSelector) {
    payload['waitForSelector'] = { selector: options.waitForSelector, timeout };
  }
  return payload;
}

function throwIfQuota(status: number, detail: string): void {
  if (status === 429 || /time limit|browser hours|quota/i.test(detail)) {
    throw new BrowserRenderingQuotaError(
      detail.trim() || 'Cloudflare Browser Rendering daily quota exceeded.',
    );
  }
}

async function htmlFromContentResponse(res: Response): Promise<string> {
  const detail = await res.text();
  if (!res.ok) {
    throwIfQuota(res.status, detail);
    throw new Error(`Browser Rendering content failed (${res.status}): ${detail.slice(0, 400)}`);
  }

  let data: ContentApiEnvelope;
  try {
    data = JSON.parse(detail) as ContentApiEnvelope;
  } catch {
    // Some binding paths may return raw HTML.
    if (detail.includes('<html') || detail.includes('<!DOCTYPE')) return detail;
    throw new Error('Browser Rendering returned a non-JSON body.');
  }

  if (!data.success || typeof data.result !== 'string') {
    const msg = data.errors?.map((e) => e.message).filter(Boolean).join('; ') || 'unsuccessful';
    throwIfQuota(res.status, msg);
    throw new Error(`Browser Rendering content unsuccessful: ${msg}`);
  }
  return data.result;
}

/** Workers binding — no API token. Used by the compare page on Cloudflare. */
export class WorkersBrowserHtmlFetcher implements RenderedHtmlFetcher {
  constructor(private readonly browser: BrowserRenderingBinding) {}

  async fetchRenderedHtml(url: string, options?: RenderHtmlOptions): Promise<string> {
    const res = await this.browser.quickAction('content', contentPayload(url, options));
    return htmlFromContentResponse(res);
  }
}

/** REST API — used by GitHub Actions daily Avito crawl (Free plan rate-limited). */
export class RestBrowserHtmlFetcher implements RenderedHtmlFetcher {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
  ) {}

  async fetchRenderedHtml(url: string, options?: RenderHtmlOptions): Promise<string> {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/browser-rendering/content`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contentPayload(url, options)),
    });
    return htmlFromContentResponse(res);
  }
}

/**
 * Resolves a Workers Browser Rendering binding when running under OpenNext /
 * workerd. Returns undefined in plain Node (CLI / GHA).
 */
export async function tryGetWorkersBrowserBinding(): Promise<
  BrowserRenderingBinding | undefined
> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const browser = (ctx.env as { BROWSER?: BrowserRenderingBinding }).BROWSER;
    return browser;
  } catch {
    return undefined;
  }
}
