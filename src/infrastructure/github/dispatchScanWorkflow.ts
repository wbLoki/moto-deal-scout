import { loadEnv } from '../../config/env.js';

/**
 * Kicks off the scan GitHub Actions workflow via a `workflow_dispatch`. This is
 * how the admin "Scan now" button works once the app runs on Cloudflare, where
 * the web host can't run Playwright itself. Uses `fetch`, so it works on both
 * Workers and Node. Throws when dispatch isn't configured or the API rejects it.
 */
export async function dispatchScanWorkflow(): Promise<void> {
  const env = loadEnv();
  if (!env.GITHUB_REPO || !env.GITHUB_DISPATCH_TOKEN) {
    throw new Error(
      'Scan dispatch is not configured — set GITHUB_REPO and GITHUB_DISPATCH_TOKEN.',
    );
  }

  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_SCAN_WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'moto-deal-scout',
    },
    body: JSON.stringify({ ref: env.GITHUB_DEFAULT_BRANCH }),
  });

  // A successful workflow_dispatch returns 204 No Content.
  if (res.status !== 204) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub dispatch failed (HTTP ${res.status}): ${detail.slice(0, 200)}`);
  }
}
