# Hosting on Cloudflare (Workers, via OpenNext)

The web app runs on **Cloudflare Workers** using the [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
adapter. Avito HTML is fetched with **Cloudflare Browser Rendering** (Workers Free).
Biker search still uses Playwright on GitHub Actions.

## Architecture

| Piece | Where it runs |
| --- | --- |
| Next.js app (UI, server actions, auth, AI features) | Cloudflare Workers |
| Database | Turso — `@libsql/client/web` on Workers |
| Compare Avito listing links | Worker `BROWSER` binding → Quick Action `/content` |
| Daily scan (watched models) | GitHub Actions — Avito via Browser Rendering REST; Biker via Playwright |
| Weekly discovery | GitHub Actions — **Biker only** on Free (too many pages for BR budget) |
| Admin **“Scan now”** | Triggers `scan.yml` via the GitHub API |

### Workers Free Browser Rendering budget

Shared across compare + daily Avito (~**10 browser-minutes/day**, REST **1 req / 10s**):

- Daily Avito: `AVITO_MAX_PAGES=1`, `SCRAPE_THROTTLE_MS=10000`, watched models only.
- On HTTP 429 / time-limit, Avito stops early; Biker still runs.
- Upgrade to Workers Paid for deeper Avito crawls / discovery.

## One-time setup

1. **Cloudflare**: create an API token with Workers deploy **and** `Browser Rendering - Edit`, note your account id. Repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Optional dedicated `BROWSER_RENDERING_API_TOKEN` if you split permissions.
2. **Worker secrets** (set once; they persist on the Worker):
   ```bash
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put DATABASE_AUTH_TOKEN
   npx wrangler secret put AUTH_SECRET
   npx wrangler secret put GEMINI_API_KEY          # or ANTHROPIC_API_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put DISCORD_WEBHOOK_URL
   npx wrangler secret put GITHUB_DISPATCH_TOKEN   # PAT with actions:write, for "Scan now"
   # OAuth (optional): AUTH_GOOGLE_ID/SECRET, AUTH_GITHUB_ID/SECRET
   ```
   Non-secret values can go in `wrangler.jsonc` under `"vars"` instead:
   `AI_PROVIDER`, `GEMINI_MODEL`, `APP_BASE_URL`, `GITHUB_REPO`, `ALERT_FROM_EMAIL`.
   The `browser.binding` (`BROWSER`) is declared in `wrangler.jsonc` — no secret for the binding itself.
3. **GitHub Actions secrets** for the scrapers: `DATABASE_URL`,
   `DATABASE_AUTH_TOKEN`, `DISCORD_WEBHOOK_URL`, `RESEND_API_KEY`,
   `ALERT_FROM_EMAIL`, `APP_BASE_URL`, plus `CLOUDFLARE_ACCOUNT_ID` and a
   Browser Rendering token (`BROWSER_RENDERING_API_TOKEN` or `CLOUDFLARE_API_TOKEN`).

## Deploying

### Preferred: GitHub Actions

Push to any branch → `.github/workflows/deploy.yml` builds with OpenNext on Linux:

| Branch | Worker | Typical URL |
| --- | --- | --- |
| `main` | `motosnipe` | `https://motosnipe.com` |
| any other | `motosnipe-preview` | `https://preview.motosnipe.com` |

Repo secrets needed: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Preview notes:

- Attach `preview.motosnipe.com` to the **`motosnipe-preview`** Worker (and
  `motosnipe.com` / `www` to **`motosnipe`**). `wrangler.jsonc` declares these
  as `routes` with `custom_domain: true` so deploys keep them on the right Worker.
  If the subdomain was previously on production, remove it there first or the
  preview deploy will fail to claim it.
- Upload preview secrets once: `npm run cf:secrets -- --preview`
- One shared preview URL means the **latest** non-`main` push wins.

### Alternative: Cloudflare Workers Builds (dashboard Git integration)

If the Worker is connected to GitHub in the Cloudflare dashboard, **do not** use
the default `npm run build` + `wrangler deploy`. That only produces `.next/` and
then fails with:

```text
The entry-point file at ".open-next/worker.js" was not found.
```

In **Workers → your worker → Settings → Build**, set:

| Field | Value |
| --- | --- |
| **Build command** | `npx opennextjs-cloudflare build` |
| **Deploy command** | `npx opennextjs-cloudflare deploy` |

(`npm run cf:build` / `npm run cf:deploy` are fine too.)

### Manual (Linux/WSL only)

```bash
npm run cf:deploy
```

> ⚠️ **Do not build on native Windows.** OpenNext warns it "is not fully compatible
> with Windows," and the build fails there while copying `node_modules` files
> (e.g. libsql's `workerd` exports). Use WSL or CI (the deploy workflow). Plain
> `next build` and `npm run dev` work fine on Windows.

`@libsql/isomorphic-ws` must stay in `serverExternalPackages` in
[`next.config.mjs`](next.config.mjs) so OpenNext copies its `workerd` entry
(`web.mjs`) into `.open-next`. Without that, Cloudflare builds fail with
`Could not resolve "@libsql/isomorphic-ws"`.

On **native Windows**, OpenNext 1.20.x also fails to match that package name
because of path separators (`@libsql\isomorphic-ws`). This repo includes a
`patch-package` fix under `patches/` (applied on `npm install`). Prefer
GitHub Actions / WSL for deploys anyway.

Do **not** import `playwright` / `playwright-core` from any module the Worker
serves (compare uses Browser Rendering Quick Actions). OpenNext’s esbuild step
fails on unresolved `chromium-bidi` paths inside playwright-core.

## Local development

Unchanged: `npm run dev` (Turso via `DATABASE_URL` in `.env`). To preview the
actual Worker build locally, use WSL: `npm run cf:preview`.

Local Avito CLI scans use Playwright when `CLOUDFLARE_ACCOUNT_ID` /
`CLOUDFLARE_API_TOKEN` are unset; with those set they use Browser Rendering REST.

## Verified vs. needs a real deploy

**Verified locally:** `next build` / `tsc` / unit tests for parsers. OpenNext
must not pull Playwright into the Worker graph.

**Not yet verified (needs a Linux deploy):** Worker `BROWSER` binding on
`/compare` Avito links; GHA daily Avito via REST under Free quota.

## Later: durable cache

For a persistent public-dashboard cache (`unstable_cache` / `revalidateTag`),
create an R2 bucket + binding and wire `r2IncrementalCache` into
`open-next.config.ts`. Without it the app still works; those results just
recompute instead of persisting across Worker instances.
