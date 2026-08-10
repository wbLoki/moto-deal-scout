# Hosting on Cloudflare (Workers, via OpenNext)

The web app runs on **Cloudflare Workers** using the [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
adapter. Scraping (Playwright) **cannot** run on Workers, so it lives entirely in
GitHub Actions and on your local/residential box.

## Architecture after the move

| Piece | Where it runs |
| --- | --- |
| Next.js app (UI, server actions, auth, AI features) | Cloudflare Workers |
| Database | Turso (unchanged) — via the `@libsql/client/web` HTTP client on Workers |
| Daily scan (watched models, Biker) | GitHub Actions — `.github/workflows/scan.yml` (cron + `workflow_dispatch`) |
| Weekly discovery (Biker) | GitHub Actions — `.github/workflows/discovery.yml` |
| Avito scrape | Local / Raspberry Pi (`npm run discover -- --source avito`) |
| Admin **“Scan now”** button | Triggers the scan workflow via the GitHub API |

## One-time setup

1. **Cloudflare**: create an API token with Workers deploy permissions and note
   your account id. Add them as repo secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` (used by `.github/workflows/deploy.yml`).
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
3. **GitHub Actions secrets** for the scrapers: `DATABASE_URL`,
   `DATABASE_AUTH_TOKEN`, `DISCORD_WEBHOOK_URL`, `RESEND_API_KEY`,
   `ALERT_FROM_EMAIL`, `APP_BASE_URL`.

## Deploying

### Preferred: GitHub Actions

Push to `main` → the **Deploy to Cloudflare** workflow (`.github/workflows/deploy.yml`)
runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy` on Linux.

Repo secrets needed: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

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

## Local development

Unchanged: `npm run dev` (Turso via `DATABASE_URL` in `.env`). To preview the
actual Worker build locally, use WSL: `npm run cf:preview`.

## Verified vs. needs a real deploy

**Verified locally:** `next build` compiles all routes with no Playwright in the
web bundle; `tsc`, `eslint`, and the full test suite pass; the OpenNext build
proceeds through bundling (only the Windows file-copy step fails).

**Not yet verified (needs a Linux deploy):** the Worker runtime itself — Turso
over the web client in production, NextAuth on `workerd`, and the AI calls. Run
the deploy workflow once and smoke-test `/`, `/compare`, sign-in, and an AI
estimate.

## Later: durable cache

For a persistent public-dashboard cache (`unstable_cache` / `revalidateTag`),
create an R2 bucket + binding and wire `r2IncrementalCache` into
`open-next.config.ts`. Without it the app still works; those results just
recompute instead of persisting across Worker instances.
