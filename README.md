# Moto Deal Scout

Scans Moroccan motorcycle marketplaces daily, scores listings against models you're
actually shopping for, and surfaces only the good deals — on a web dashboard and via
notifications — not every listing that exists.

Sources: [Avito.ma](https://www.avito.ma), [Biker.ma](https://www.biker.ma),
[Moteur.ma](https://www.moteur.ma) (its `/fr/moto/achat-moto-occasion/` section, despite
the site being car-focused otherwise).

It runs two ways from one codebase:

- **As a web app** (Next.js) — a dashboard of current good deals, plus a cron-triggered
  `/api/scan` route. Deploys to Vercel.
- **As a standalone CLI** — `scan` / `report` / `schedule` commands for running locally or
  on any always-on box.

## How it works

1. For each model you're hunting for (`src/config/defaultCriteria.ts`), every source is
   queried using that marketplace's own search (Avito's slug search, Biker's `modele`
   param, Moteur's `marque`/`modele` params).
2. Every listing's title is re-checked with a fuzzy matcher, since marketplace search is
   sometimes loose or, for Biker/Moteur, may not fully understand model names — a listing
   only counts if the match confidence clears `minModelMatchConfidence`.
3. New listings (not seen in a previous run) are scored 0-100 on price, mileage, year,
   and city, weighted 40/25/20/15.
4. Listings scoring at or above `minScoreForGoodDeal` (default 70) are "good deals" and
   get pushed to every configured notifier. Everything scanned — good deal or not — is
   saved to the database so it's never re-reported and so the dashboard can show it.
5. A daily report (scan stats + good deals, or "no good deals today") always goes out,
   separately from the good-deal alert.

## Setup

```bash
npm install
npm run playwright:install   # local Chromium for CLI/dev scans (not needed on Vercel)
cp .env.example .env         # then edit as needed — see below
```

Edit [`src/config/defaultCriteria.ts`](src/config/defaultCriteria.ts) to match what
you're actually shopping for: which models, what counts as a fair price for each, your
preferred cities, and the score threshold for "good deal". This is the file you'll touch
most.

## Running the web app locally

```bash
npm run dev          # Next.js dev server at http://localhost:3000
```

The dashboard reads good deals from the database. To populate it, trigger a scan — either
run the CLI (`npm run scan`) or hit the route:

```bash
curl http://localhost:3000/api/scan
```

(Locally, with no `CRON_SECRET` set, the route is open. See deployment for how it's
protected in production.)

## Accounts, roles, and requests (multi-user)

The root `/` is a public landing page (what the app does + a teaser of the hottest deals);
everything else requires sign-in. It's multi-tenant: one shared daily scan feeds everyone,
and each signed-in user gets a personal view (logged-in users see their dashboard at `/`).

- **Sign-in** — email+password ([Auth.js](https://authjs.dev) with bcrypt), plus optional
  Google/GitHub OAuth that light up only when their env vars are set. Set `AUTH_SECRET` (required
  in production) and `ADMIN_EMAIL` (the address that becomes **admin** on sign-up).
- **Onboarding + watched models** — after sign-up a user is sent to `/onboarding` to pick the
  models they want to follow (editable anytime on `/profile`). The dashboard then shows three
  groupings, each filtered to the user's range: **Daily deals** (found in the latest day),
  **Your watched models**, and **All deals**.
- **Your range (per user)** — the dashboard's **Your range** panel sets a personal budget and
  model-year window. It's a _view filter_: your dashboard shows only good deals inside it. Saving
  re-filters instantly (no scan needed); it doesn't affect anyone else or what gets scraped.
- **Admin (`/admin`)** — a **Models** tab manages the tracked models (brand, aliases, fair-value
  price range, mileage/year used for _scoring_, enable/disable, delete — with a catalog picker and
  search) and runs **Scan now**. Models live in the database, seeded once from
  [`defaultCriteria.ts`](src/config/defaultCriteria.ts). An **Analytics** tab
  (`/admin/analytics`) shows metrics from the app's own database — user totals, sign-ups per day,
  sign-up method, watchlists, model requests, and listings by source. Visitor traffic/geography
  lives in Vercel Analytics (`@vercel/analytics`, wired into the layout).
- **Model requests (`/requests`)** — any user can suggest a model. It lands in the admin's
  approval queue; approving creates an enabled model (with starter criteria the admin refines).

Roles and route access are enforced by `middleware.ts` (redirects anonymous users to `/login`)
and re-checked inside every admin server action. The split `auth.config.ts` (edge-safe) /
`auth.ts` (Node) keeps bcrypt and DB access out of the edge middleware.

## Running the CLI

```bash
npm run scan       # run one scan now, notify about good deals, exit
npm run report     # re-send today's good-deal digest from storage, without scanning
npm run schedule   # start the built-in cron scheduler and keep running (8:00 AM Africa/Casablanca)
```

`schedule` is the always-on mode for a VPS / systemd / pm2 / container: it keeps the
process alive and runs a scan every day at the configured time, independent of Vercel.
Build the CLI to plain JS with `npm run build:cli` (outputs to `dist/`).

## Deploying to Vercel

Vercel doesn't run long-lived processes or keep a local filesystem, so two things differ
from local use: the schedule comes from Vercel Cron hitting `/api/scan`, and the database
must be remote. [Turso](https://turso.tech) is the natural fit — it's libsql (the same
SQLite dialect this app already uses), so no code changes are needed.

1. **Create a Turso database** and grab its URL and an auth token:
   ```bash
   turso db create moto-deal-scout
   turso db show moto-deal-scout --url         # -> DATABASE_URL
   turso db tokens create moto-deal-scout      # -> DATABASE_AUTH_TOKEN
   ```
   (The `listings` table is created automatically on first connection.)
2. **Import the repo into Vercel** and set environment variables (Project → Settings →
   Environment Variables):
   - `DATABASE_URL` = `libsql://<your-db>.turso.io`
   - `DATABASE_AUTH_TOKEN` = the token from step 1
   - `CRON_SECRET` = any long random string — Vercel automatically sends it to the cron
     route as a Bearer token, and `/api/scan` + `/api/report` reject requests without it
   - `DISCORD_WEBHOOK_URL` = optional, to also push alerts to Discord
3. **Deploy.** The cron in [`vercel.json`](vercel.json) runs `/api/scan` daily.

On Vercel the app uses `@sparticuz/chromium` + `playwright-core` for a serverless-friendly
Chromium — selected automatically at runtime via the `VERCEL` env var, so nothing to
configure.

### Caveats worth knowing

- **Function timeout.** A full scan (3 sources × several models × a few pages) can take a
  while. `/api/scan` sets `maxDuration = 60`, the Hobby-plan ceiling; Pro allows more. If
  scans time out, raise `maxDuration`, trim `models` in your criteria, lower `maxPages` in
  the sources, or reduce `SCRAPE_THROTTLE_MS`.
- **Cron timezone.** Vercel Cron runs in **UTC**. [`vercel.json`](vercel.json) uses
  `0 7 * * *` ≈ 8:00 AM in Morocco (UTC+1). Morocco pauses to UTC+0 during Ramadan, when
  that run lands at 7:00 AM local — adjust if it matters. (The `SCAN_TIMEZONE` /
  `SCAN_CRON_EXPRESSION` vars only affect the standalone CLI `schedule` command, not
  Vercel.)
- **Hobby crons** run once per day max, which is exactly this schedule.

## Notifications

- **Console** — always on, prints to stdout. Handy for the CLI and for reading Vercel
  function logs.
- **Discord** — set `DISCORD_WEBHOOK_URL` to a
  [channel webhook URL](https://support.discord.com/hc/en-us/articles/228383668) and it
  activates automatically. Leave it unset and the provider silently no-ops.

To add a new channel (Telegram, email, SMS, ...), implement
[`NotificationProvider`](src/domain/interfaces/NotificationProvider.ts) and add an
instance to the `notifiers` array in [`src/container.ts`](src/container.ts). Nothing else
needs to change.

## Configuration reference (`.env`)

| Variable                | Default                         | Notes                                                                         |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`          | _(unset)_                       | libsql URL. Unset locally (a `file:` URL is derived); set to Turso on Vercel. |
| `DATABASE_AUTH_TOKEN`   | _(unset)_                       | Auth token for a remote Turso database.                                       |
| `DATABASE_PATH`         | `./data/moto-deal-scout.sqlite` | Local SQLite file, used only when `DATABASE_URL` is unset.                    |
| `CRON_SECRET`           | _(unset)_                       | Protects `/api/scan` + `/api/report`. Always set it in production.            |
| `CRITERIA_CONFIG_PATH`  | _(unset)_                       | Optional JSON file overriding `defaultCriteria.ts` — see below.               |
| `SCAN_CRON_EXPRESSION`  | `0 8 * * *`                     | CLI `schedule` only (not Vercel).                                             |
| `SCAN_TIMEZONE`         | `Africa/Casablanca`             | CLI `schedule` only (not Vercel).                                             |
| `SCRAPE_THROTTLE_MS`    | `2000`                          | Delay between page loads on the same marketplace.                             |
| `PLAYWRIGHT_HEADLESS`   | `true`                          | Local only; set `false` to watch the browser while debugging a scraper.       |
| `DISCORD_WEBHOOK_URL`   | _(unset)_                       | Activates the Discord notifier.                                               |
| `AUTH_SECRET`           | _(unset)_                       | Auth.js session secret. Required in production (`openssl rand -base64 32`).   |
| `ADMIN_EMAIL`           | _(unset)_                       | Address that gets the admin role on sign-up.                                  |
| `AUTH_GOOGLE_ID/SECRET` | _(unset)_                       | Enables Google OAuth when both are set.                                       |
| `AUTH_GITHUB_ID/SECRET` | _(unset)_                       | Enables GitHub OAuth when both are set.                                       |

### Overriding criteria without editing code

Set `CRITERIA_CONFIG_PATH` to a JSON file shaped like `defaultCriteria.ts`'s export
(validated against [`criteriaSchema.ts`](src/config/criteriaSchema.ts) — a malformed
file fails fast with a readable error rather than silently misbehaving):

```json
{
  "models": [
    {
      "id": "yamaha-mt07",
      "brand": "Yamaha",
      "model": "MT-07",
      "aliases": ["MT07", "MT 07"],
      "priceRangeMAD": { "min": 65000, "max": 95000 },
      "maxMileageKm": 30000,
      "minYear": 2017
    }
  ],
  "global": {
    "preferredCities": ["Casablanca", "Rabat"],
    "acceptableCities": [],
    "minScoreForGoodDeal": 70,
    "maxListingAgeDays": 14,
    "minModelMatchConfidence": 0.55,
    "minPriceFactor": 0.5
  }
}
```

`minPriceFactor` is a plausibility floor: a listing priced below a model's fair-value
minimum × this factor (e.g. an MT-07 under 65 000 × 0.5 = 32 500 MAD) is treated as a
typo, a deposit ("avance"), or a scam and dropped — at scan time, and also hidden on the
dashboard for anything stored before the floor existed. Set it to `0` to disable.

## Scoring

Weights sum to 100: **price 40, mileage 25, year 20, city 15**.

- **Price** — full points at or below `priceRangeMAD.min`; zero once 20% above `max`;
  linear in between.
- **Mileage** — full points below 40% of `maxMileageKm`; zero once 15% over it. Unknown
  mileage scores as average (half points) rather than being penalized or rewarded.
- **Year** — full points at the current year; zero at `minYear - 2`. Unknown year scores
  as average.
- **City** — full points for the top `preferredCities` entry, decreasing toward later
  ones; half points for any other city (unless `acceptableCities` is non-empty, in which
  case cities outside it are excluded before scoring even happens).

See [`ListingScorer.ts`](src/application/services/ListingScorer.ts) for the exact curve
and [`reasons`](src/domain/entities/ScoredListing.ts) generation — every score comes with
a human-readable breakdown of why.

## Architecture

Clean-architecture-ish layering, dependencies point inward. The web app and the CLI are
two thin entrypoints over the same core:

```
app/                Next.js — dashboard page + /api/scan and /api/report route handlers
src/
  domain/           entities + interfaces only — no framework, no I/O
  application/      FuzzyModelMatcher, ListingScorer, DealScanner, notifier dispatch
  infrastructure/   Playwright sources (local + serverless), libsql repository, notifiers
  config/           env + search-criteria loading and validation (zod)
  container.ts      composition root — the only file that wires concrete classes together
  runners.ts        runScan() / runReport() — shared by the CLI and the API routes
  readModel.ts      lightweight DB read path for the dashboard (no browser)
  cli.ts            commander entrypoint (scan / report / schedule)
```

- **Add a marketplace**: implement [`MarketplaceSource`](src/domain/interfaces/MarketplaceSource.ts)
  under `infrastructure/sources/`, add it to the `sources` array in `container.ts`. The
  application layer (matching, scoring, dedup, notifying) doesn't change.
- **Add a notifier**: implement [`NotificationProvider`](src/domain/interfaces/NotificationProvider.ts),
  add it to `container.ts`'s `notifiers` array.
- **Swap storage**: implement [`ListingRepository`](src/domain/interfaces/ListingRepository.ts).
  The default is one libsql-backed implementation that serves both a local SQLite file and
  remote Turso.

## Testing

```bash
npm test            # vitest run, 66 tests
npm run test:watch
npm run typecheck   # tsc over CLI, app, and tests
npm run lint
```

Unit tests cover the fuzzy matcher, scorer, libsql repository (in-memory), notifiers
(mocked fetch for Discord), the scanner (fake sources/repository), and the text-parsing
helpers the scrapers depend on. The Playwright sources themselves aren't unit tested
(they're thin, selector-heavy, and were verified against the live sites during
development) — see the note below.

## A note on the scrapers

All three marketplaces render listings client-side with framework-specific markup:

- **Avito.ma** uses styled-components with hashed class names that churn across
  deploys, so `AvitoSource` deliberately avoids them, anchoring on `data-testid`
  prefixes, `title` attributes, and structural text patterns (e.g., the number
  immediately before a literal "DH" span) instead.
- **Biker.ma** (Angular) and **Moteur.ma** (server-rendered, semantic class names) are
  more stable but still selector-dependent.

Selectors were verified against live pages during development, but marketplaces change
their markup without notice — if a source starts returning zero results, that's the
first thing to check. `PLAYWRIGHT_HEADLESS=false` is useful for watching a scrape live.

Also: marketplace data is occasionally garbage (typos, joke listings, placeholder
prices). The scorer takes listing data at face value, so an implausibly good score is
sometimes a seller's typo rather than a real deal — always click through before buying.
