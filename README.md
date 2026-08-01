# Moto Deal Scout

Scans Moroccan motorcycle marketplaces daily, scores listings against models you're
actually shopping for, and only notifies you about the good deals — not every listing
that exists.

Sources: [Avito.ma](https://www.avito.ma), [Biker.ma](https://www.biker.ma),
[Moteur.ma](https://www.moteur.ma) (its `/fr/moto/achat-moto-occasion/` section, despite
the site being car-focused otherwise).

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
   saved to SQLite so it's never re-reported.
5. A daily report (scan stats + good deals, or "no good deals today") always goes out,
   separately from the good-deal alert.

## Setup

```bash
npm install
npm run playwright:install   # downloads the Chromium build Playwright drives
cp .env.example .env         # then edit as needed — see below
```

Edit [`src/config/defaultCriteria.ts`](src/config/defaultCriteria.ts) to match what
you're actually shopping for: which models, what counts as a fair price for each, your
preferred cities, and the score threshold for "good deal". This is the file you'll touch
most.

## Running it

```bash
npm run dev:scan       # run one scan now, notify about good deals, exit
npm run dev:report     # re-send today's good-deal digest from storage, without scanning
npm run dev:schedule   # start the cron scheduler and keep running (8:00 AM Africa/Casablanca by default)
```

For production, `npm run build` then `npm start` (runs `schedule` from compiled JS) —
or point a process manager (`pm2`, systemd, a container) at the `schedule` command so it
survives restarts and keeps its daily cadence.

## Notifications

- **Console** — always on, prints to stdout. Good for `schedule` running under a
  supervisor whose logs you check, or just for `dev:scan` while you're tuning criteria.
- **Discord** — set `DISCORD_WEBHOOK_URL` in `.env` to a
  [channel webhook URL](https://support.discord.com/hc/en-us/articles/228383668) and it
  activates automatically. Leave it unset and the provider silently no-ops — it's safe to
  leave wired up either way.

To add a new channel (Telegram, email, SMS, ...), implement
[`NotificationProvider`](src/domain/interfaces/NotificationProvider.ts) and add an
instance to the `notifiers` array in [`src/container.ts`](src/container.ts). Nothing else
needs to change.

## Configuration reference (`.env`)

| Variable               | Default                         | Notes                                                           |
| ---------------------- | ------------------------------- | --------------------------------------------------------------- |
| `DATABASE_PATH`        | `./data/moto-deal-scout.sqlite` | Created automatically.                                          |
| `CRITERIA_CONFIG_PATH` | _(unset)_                       | Optional JSON file overriding `defaultCriteria.ts` — see below. |
| `SCAN_CRON_EXPRESSION` | `0 8 * * *`                     | Standard 5-field cron.                                          |
| `SCAN_TIMEZONE`        | `Africa/Casablanca`             | IANA timezone name.                                             |
| `SCRAPE_THROTTLE_MS`   | `2000`                          | Delay between page loads on the same marketplace.               |
| `PLAYWRIGHT_HEADLESS`  | `true`                          | Set `false` to watch the browser while debugging a scraper.     |
| `DISCORD_WEBHOOK_URL`  | _(unset)_                       | Activates the Discord notifier.                                 |

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
    "minModelMatchConfidence": 0.55
  }
}
```

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

Clean-architecture-ish layering, dependencies point inward:

```
src/
  domain/           entities + interfaces only — no framework, no I/O
  application/      FuzzyModelMatcher, ListingScorer, DealScanner, notifier dispatch
  infrastructure/    Playwright sources, SQLite repository, Discord/console notifiers
  config/           env + search-criteria loading and validation (zod)
  container.ts       composition root — the only file that wires concrete classes together
  cli.ts             commander entrypoint (scan / report / schedule)
```

- **Add a marketplace**: implement [`MarketplaceSource`](src/domain/interfaces/MarketplaceSource.ts)
  under `infrastructure/sources/`, add it to the `sources` array in `container.ts`. The
  application layer (matching, scoring, dedup, notifying) doesn't change.
- **Add a notifier**: implement [`NotificationProvider`](src/domain/interfaces/NotificationProvider.ts),
  add it to `container.ts`'s `notifiers` array.
- **Swap storage**: implement [`ListingRepository`](src/domain/interfaces/ListingRepository.ts)
  against whatever you want instead of SQLite.

## Testing

```bash
npm test            # vitest run, 65 tests
npm run test:watch
npm run typecheck
npm run lint
```

Unit tests cover the fuzzy matcher, scorer, SQLite repository (in-memory), notifiers
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
