import { runUserAlerts } from './alerts.js';
import {
  CatalogModelResolver,
  MIN_DISCOVERY_CONFIDENCE,
} from './application/services/CatalogModelResolver.js';
import { calibrateModels } from './calibration.js';
import { buildContainer } from './container.js';
import type { DailyReport } from './domain/entities/DailyReport.js';

/**
 * Runs one full scan and dispatches notifications, then tears everything
 * down. Shared by the CLI `scan` command and the `/api/scan` cron route so
 * both behave identically.
 *
 * Calibration runs first so this scan scores against fair-value ranges
 * refreshed from all prior market data. Per-user watchlist alerts run last,
 * after the scan's database connection is closed.
 */
/** Optional overrides shared by the CLI-invoked runs. */
export interface RunOptions {
  /** Marketplace source ids to scrape; defaults to `SCRAPE_SOURCES`, then all. */
  readonly sources?: readonly string[];
}

export async function runScan(options: RunOptions = {}): Promise<DailyReport> {
  await calibrateModels();
  const report = await scanAndNotify(options);
  await runUserAlerts(report);
  return report;
}

async function scanAndNotify(options: RunOptions): Promise<DailyReport> {
  // Only models someone follows — this is the daily run, and it has to fit
  // inside Vercel's function timeout. The weekly discovery crawl is what
  // covers the rest of the market.
  const container = await buildContainer({
    onlyWatched: true,
    ...(options.sources ? { sources: options.sources } : {}),
  });
  try {
    const report = await container.scanner.scan();
    await container.dispatcher.dispatch(report);
    return report;
  } finally {
    await container.shutdown();
  }
}

/**
 * The weekly deep crawl: browse both marketplaces' whole motorcycle category,
 * auto-create any catalog model we find, and score what turns up.
 *
 * Far too slow for a Vercel function (tens of pages per source at a couple of
 * seconds each), so this runs from CI or a box you control.
 *
 * Calibration runs twice on purpose. The first pass refreshes existing fair
 * ranges before anything is scored; the second lets a model discovered during
 * *this* crawl, which has now collected enough listings, leave "Calibrating"
 * immediately instead of waiting a week for the next run.
 */
/** Discovery adds a `--full` bypass of the incremental watermark. */
export interface DiscoveryRunOptions extends RunOptions {
  readonly full?: boolean;
}

export async function runDiscovery(
  maxPages?: number,
  options: DiscoveryRunOptions = {},
): Promise<DailyReport> {
  assertRemoteDatabaseInCi();
  await calibrateModels();

  const container = await buildContainer({
    discovery: {
      ...(maxPages === undefined ? {} : { maxPages }),
      ...(options.full ? { full: true } : {}),
    },
    ...(options.sources ? { sources: options.sources } : {}),
  });
  let report: DailyReport;
  try {
    report = await container.scanner.discover();
    await container.dispatcher.dispatch(report);
  } finally {
    await container.shutdown();
  }

  await calibrateModels();
  await runUserAlerts(report);
  return report;
}

/**
 * Without DATABASE_URL the config falls back to a local SQLite file. On a CI
 * runner that means a long crawl writes to a throwaway disk and is discarded
 * with the container — silently, and only noticed when the dashboard stays
 * empty. Fail loudly instead.
 */
function assertRemoteDatabaseInCi(): void {
  if (process.env['CI'] && !process.env['DATABASE_URL']) {
    throw new Error(
      'DATABASE_URL is not set. Refusing to run a discovery crawl in CI that would write ' +
        'to a local throwaway database — set the DATABASE_URL/DATABASE_AUTH_TOKEN secrets.',
    );
  }
}

export interface DryRunResult {
  readonly scanned: number;
  readonly resolved: number;
  /** Model ids that would be created, with the titles that produced them. */
  readonly wouldCreate: ReadonlyMap<string, string[]>;
}

/**
 * Crawls exactly like {@link runDiscovery} but writes nothing — it prints how
 * each title resolves and which models would be created.
 *
 * Worth running before the first real crawl: a wrong match here becomes a
 * permanent model row that users can follow, and reading a couple of hundred
 * `title -> id` lines is the cheapest way to catch that.
 */
export async function runDiscoveryDryRun(
  maxPages?: number,
  options: RunOptions = {},
): Promise<DryRunResult> {
  const resolver = new CatalogModelResolver();
  const container = await buildContainer(options.sources ? { sources: options.sources } : {});
  const existing = new Set(container.criteria.models.map((m) => m.id));
  const wouldCreate = new Map<string, string[]>();
  let scanned = 0;
  let resolved = 0;

  try {
    for (const source of container.sources) {
      const listings = await source.fetchListings(
        maxPages === undefined ? {} : { maxPages },
      );
      scanned += listings.length;

      for (const listing of listings) {
        const match = resolver.resolve(listing.title);
        if (!match || match.confidence < MIN_DISCOVERY_CONFIDENCE) {
          console.log(`  ${listing.title}`);
          continue;
        }
        resolved += 1;
        console.log(`✓ ${listing.title}\n    -> ${match.id} (confidence ${match.confidence})`);
        if (!existing.has(match.id)) {
          wouldCreate.set(match.id, [...(wouldCreate.get(match.id) ?? []), listing.title]);
        }
      }
    }
  } finally {
    await container.shutdown();
  }

  console.log(
    `\n${resolved}/${scanned} titles resolved; ${wouldCreate.size} new model(s) would be created:`,
  );
  for (const [id, titles] of [...wouldCreate].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${id}  (${titles.length} listing${titles.length === 1 ? '' : 's'})`);
  }
  console.log('\nDry run — nothing was written.');

  return { scanned, resolved, wouldCreate };
}

/**
 * Rebuilds today's good-deal digest from storage (no scraping) and
 * dispatches it. Shared by the CLI `report` command and `/api/report`.
 */
export async function runReport(): Promise<DailyReport> {
  const container = await buildContainer();
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const report = await container.reportService.buildSince(startOfToday);
    await container.dispatcher.dispatch(report);
    return report;
  } finally {
    await container.shutdown();
  }
}
