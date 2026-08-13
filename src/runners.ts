import { runUserAlerts } from './alerts.js';
import {
  CatalogModelResolver,
  MIN_DISCOVERY_CONFIDENCE,
} from './application/services/CatalogModelResolver.js';
import { CAR_CATALOG } from './catalog/carCatalog.js';
import { MOTORCYCLE_CATALOG } from './catalog/motorcycleCatalog.js';
import { calibrateModels } from './calibration.js';
import { buildContainer } from './container.js';
import type { DailyReport } from './domain/entities/DailyReport.js';
import { isCarMarketplace } from './domain/entities/Listing.js';
import type { VehicleType } from './domain/entities/VehicleType.js';

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
  // The daily scan now persists a full catalog crawl, so protect it the same way
  // discovery is: without DATABASE_URL in CI it would write to a throwaway local
  // SQLite that's discarded when the job ends — the run "succeeds" and even sends
  // its Discord report, but nothing reaches the real database. Fail loudly.
  assertRemoteDatabaseInCi();
  await calibrateModels();
  const report = await scanAndNotify(options);
  await runUserAlerts(report);
  return report;
}

/**
 * How deep the daily run paginates each source's category. Avito is capped far
 * shorter by AVITO_MAX_PAGES (rate-limited Browser Rendering); this is really
 * the Biker depth. Keep it inside the GHA/Vercel time budget.
 */
const DAILY_MAX_PAGES = 20;

function vehicleTypesToRun(sourceIds: readonly string[] | undefined): VehicleType[] {
  if (!sourceIds?.length) return ['motorcycle', 'car'];
  const types: VehicleType[] = [];
  if (sourceIds.some((id) => !isCarMarketplace(id))) types.push('motorcycle');
  if (sourceIds.some((id) => isCarMarketplace(id))) types.push('car');
  return types;
}

function sourcesForType(
  sourceIds: readonly string[] | undefined,
  vehicleType: VehicleType,
): readonly string[] | undefined {
  if (!sourceIds?.length) return undefined;
  return sourceIds.filter((id) => (isCarMarketplace(id) ? 'car' : 'motorcycle') === vehicleType);
}

function mergeReports(reports: readonly DailyReport[]): DailyReport {
  const first = reports[0];
  return {
    runAt: first?.runAt ?? new Date(),
    sources: reports.flatMap((r) => r.sources),
    totalListingsScanned: reports.reduce((n, r) => n + r.totalListingsScanned, 0),
    newListingsSeen: reports.reduce((n, r) => n + r.newListingsSeen, 0),
    goodDeals: reports.flatMap((r) => r.goodDeals),
    priceDrops: reports.flatMap((r) => r.priceDrops),
  };
}

async function discoverAllTypes(
  discovery: { maxPages?: number; full?: boolean },
  options: RunOptions,
): Promise<DailyReport> {
  const reports: DailyReport[] = [];
  for (const vehicleType of vehicleTypesToRun(options.sources)) {
    const typeSources = sourcesForType(options.sources, vehicleType);
    if (typeSources && typeSources.length === 0) continue;
    const container = await buildContainer({
      vehicleType,
      discovery,
      ...(typeSources ? { sources: typeSources } : {}),
    });
    try {
      reports.push(await container.scanner.discover());
    } finally {
      await container.shutdown();
    }
  }
  return mergeReports(reports);
}

async function scanAndNotify(options: RunOptions): Promise<DailyReport> {
  const report = await discoverAllTypes({ maxPages: DAILY_MAX_PAGES }, options);
  const container = await buildContainer();
  try {
    await container.dispatcher.dispatch(report);
  } finally {
    await container.shutdown();
  }
  return report;
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

  const report = await discoverAllTypes(
    {
      ...(maxPages === undefined ? {} : { maxPages }),
      ...(options.full ? { full: true } : {}),
    },
    options,
  );
  const container = await buildContainer();
  try {
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
  const motoResolver = new CatalogModelResolver(MOTORCYCLE_CATALOG);
  const carResolver = new CatalogModelResolver(CAR_CATALOG);
  const wouldCreate = new Map<string, string[]>();
  let scanned = 0;
  let resolved = 0;
  const existing = new Set<string>();

  for (const vehicleType of vehicleTypesToRun(options.sources)) {
    const typeSources = sourcesForType(options.sources, vehicleType);
    if (typeSources && typeSources.length === 0) continue;
    const container = await buildContainer({
      vehicleType,
      ...(typeSources ? { sources: typeSources } : {}),
    });
    for (const m of container.criteria.models) existing.add(m.id);
    const resolver = vehicleType === 'car' ? carResolver : motoResolver;
    try {
      for (const source of container.sources) {
        const listings = await source.fetchListings(maxPages === undefined ? {} : { maxPages });
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
