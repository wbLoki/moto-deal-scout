import pino from 'pino';
import { DailyReportService } from './application/services/DailyReportService.js';
import { DealScanner } from './application/services/DealScanner.js';
import { NotificationDispatcher } from './application/services/NotificationDispatcher.js';
import { CAR_CATALOG } from './catalog/carCatalog.js';
import { MOTORCYCLE_CATALOG } from './catalog/motorcycleCatalog.js';
import { defaultCarModels } from './config/defaultCarCriteria.js';
import type { VehicleType } from './domain/entities/VehicleType.js';
import { loadEnv } from './config/env.js';
import { loadCriteria } from './config/loadCriteria.js';
import type { SearchCriteria } from './domain/entities/SearchCriteria.js';
import type { ListingRepository } from './domain/interfaces/ListingRepository.js';
import type { MarketplaceSource } from './domain/interfaces/MarketplaceSource.js';
import type { NotificationProvider } from './domain/interfaces/NotificationProvider.js';
import { AvitoSource } from './infrastructure/sources/avito/AvitoSource.js';
import { BikerSource } from './infrastructure/sources/biker/BikerSource.js';
import { MoteurSource } from './infrastructure/sources/moteur/MoteurSource.js';
import { ConsoleNotificationProvider } from './infrastructure/notifications/ConsoleNotificationProvider.js';
import { DiscordNotificationProvider } from './infrastructure/notifications/DiscordNotificationProvider.js';
import {
  openDatabase,
  resolveDatabaseConfig,
} from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { CatalogModelResolver } from './application/services/CatalogModelResolver.js';
import { saveForReview } from './reviewQueue.js';
import { createRenderedHtmlFetcher } from './infrastructure/browser/createRenderedHtmlFetcher.js';
import type { BrowserManager } from './infrastructure/sources/shared/BrowserManager.js';
import { PlaywrightBrowserManager } from './infrastructure/sources/shared/PlaywrightBrowserManager.js';
import { ServerlessPlaywrightBrowserManager } from './infrastructure/sources/shared/ServerlessPlaywrightBrowserManager.js';
import type { Env } from './config/env.js';

/**
 * Everything the CLI needs, wired up in one place. This is the only file
 * that knows about concrete infrastructure classes — application services
 * only see the domain interfaces, so swapping SQLite for something else,
 * or adding a fourth marketplace, never touches them.
 */
export interface Container {
  readonly logger: pino.Logger;
  readonly criteria: SearchCriteria;
  readonly repository: ListingRepository;
  readonly sources: readonly MarketplaceSource[];
  readonly notifiers: readonly NotificationProvider[];
  readonly scanner: DealScanner;
  readonly reportService: DailyReportService;
  readonly dispatcher: NotificationDispatcher;
  shutdown(): Promise<void>;
}

export interface ContainerOptions {
  /**
   * Narrow the scan to models at least one user follows. The daily scan uses
   * this to stay small enough for Vercel's function timeout; the weekly
   * discovery crawl covers everything else.
   */
  readonly onlyWatched?: boolean;
  /** Wires up discovery (catalog resolver + model sink) and sets crawl depth. */
  readonly discovery?: {
    readonly maxPages?: number;
    /** Ignore the per-source scrape watermark and crawl in full (`discover --full`). */
    readonly full?: boolean;
  };
  /**
   * Which marketplace sources to scrape (by id). Falls back to `SCRAPE_SOURCES`
   * in the env, then to all sources. Lets a run target just Avito or just Biker.
   */
  readonly sources?: readonly string[];
  /** Which vehicle market this container scrapes. Defaults to motorcycles. */
  readonly vehicleType?: VehicleType;
}

export async function buildContainer(options: ContainerOptions = {}): Promise<Container> {
  const env = loadEnv();
  const logger = pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty' } } : {}),
  });

  // Tracked models live in the DB (admin-managed); the config file only
  // seeds them on first run and supplies the global scoring settings. The
  // scan iterates the enabled models and stores every match; budget/year
  // filtering is per-user and applied on the dashboard, not here.
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const dbConfig = resolveDatabaseConfig(env);
  // Surface which database this run writes to. A local `file:` target in a
  // scheduled/CI run means results won't persist — the #1 cause of "the report
  // says N new but the site shows nothing".
  logger.info({ database: describeDbTarget(dbConfig.url) }, 'database target');
  const db = await openDatabase(dbConfig);
  const modelRepo = new LibsqlModelRepository(db);
  const vehicleType = options.vehicleType ?? 'motorcycle';
  await modelRepo.seedIfEmptyForType(config.models, 'motorcycle');
  await modelRepo.seedIfEmptyForType(defaultCarModels, 'car');
  const enabledModels = (await modelRepo.listEnabledCriteria()).filter(
    (m) => m.vehicleType === vehicleType,
  );
  const allModels = await modelRepo.listAll();

  // The daily scan only re-checks models someone actually follows. If nobody
  // follows anything yet (fresh database, no users), fall back to every
  // enabled model rather than silently scanning nothing.
  let scanModels = enabledModels;
  if (options.onlyWatched) {
    const watched = new Set(await new LibsqlUserProfileRepository(db).listDistinctWatchedModelIds());
    const narrowed = enabledModels.filter((m) => watched.has(m.id));
    if (narrowed.length > 0) scanModels = narrowed;
    logger.info(
      { watched: watched.size, scanning: scanModels.length, enabled: enabledModels.length },
      narrowed.length > 0 ? 'scanning watched models only' : 'no watched models — scanning all',
    );
  }
  const criteria: SearchCriteria = { models: scanModels, global: config.global };

  // The listing repository needs every model (incl. disabled) to reconstruct
  // stored rows that may reference a model since turned off.
  const repository = new LibsqlListingRepository(db, allModels, logger);

  const browserManager = createBrowserManager(env);
  const htmlFetcher = await createRenderedHtmlFetcher({
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
    preferPlaywright: env.SCRAPE_USE_PLAYWRIGHT,
    // Share one Chromium with Biker when Avito uses Playwright (Pi/laptop).
    browserManager,
  });
  const sourceOptions = { throttleMs: env.SCRAPE_THROTTLE_MS };
  const avitoOptions = {
    throttleMs: env.SCRAPE_THROTTLE_MS,
    ...(env.AVITO_MAX_PAGES !== undefined ? { maxPages: env.AVITO_MAX_PAGES } : {}),
  };
  const allSources: MarketplaceSource[] =
    vehicleType === 'car'
      ? [
          new AvitoSource(
            htmlFetcher,
            { ...avitoOptions, sourceId: 'avito-cars' },
            logger.child({ source: 'avito-cars' }),
          ),
          new MoteurSource(sourceOptions, logger.child({ source: 'moteur' })),
        ]
      : [
          new AvitoSource(htmlFetcher, avitoOptions, logger.child({ source: 'avito' })),
          new BikerSource(sourceOptions, logger.child({ source: 'biker' })),
        ];
  const selection = options.sources ?? parseSourceList(env.SCRAPE_SOURCES);
  const sources = selection ? selectSources(allSources, selection) : allSources;
  logger.info({ sources: sources.map((s) => s.id) }, 'scraping sources');

  const notifiers: NotificationProvider[] = [
    new ConsoleNotificationProvider(),
    new DiscordNotificationProvider(env.DISCORD_WEBHOOK_URL, logger.child({ notifier: 'discord' })),
  ];

  const scanner = new DealScanner({
    sources,
    repository,
    criteria,
    logger,
    incremental: !options.discovery?.full,
    ...(options.discovery
      ? {
          resolver: new CatalogModelResolver(
            vehicleType === 'car' ? CAR_CATALOG : MOTORCYCLE_CATALOG,
          ),
          // insertIfAbsent, never upsert: re-discovering an already-calibrated
          // model must not reset its price range back to the provisional one.
          modelSink: (model) => modelRepo.insertIfAbsent(model),
          // Known-brand listings with no catalog model go to the admin review
          // queue instead of being dropped.
          reviewSink: (listing, brand) => saveForReview(db, listing, brand),
          ...(options.discovery.maxPages === undefined
            ? {}
            : { discoveryMaxPages: options.discovery.maxPages }),
        }
      : {}),
  });
  const reportService = new DailyReportService(repository);
  const dispatcher = new NotificationDispatcher(notifiers, logger);

  return {
    logger,
    criteria,
    repository,
    sources,
    notifiers,
    scanner,
    reportService,
    dispatcher,
    async shutdown() {
      await scanner.disposeSources();
      await browserManager.close();
      await repository.close();
    },
  };
}

// Re-exported for existing importers (readModel, settingsModel). The source
// of truth now lives in the Database module so the web/auth layer can open a
// client without importing this Playwright-heavy composition root.
export { resolveDatabaseConfig };

/**
 * A log-safe description of the database target: the host for a remote Turso
 * URL, or a "local file — not persisted in CI" note for a `file:`/memory URL.
 * Never includes the auth token (it lives in a separate config field, not the URL).
 */
function describeDbTarget(url: string): string {
  if (url.startsWith('file:') || url === ':memory:') {
    return `LOCAL FILE (${url}) — not persisted in CI`;
  }
  try {
    return new URL(url).host;
  } catch {
    return 'remote';
  }
}

/** Splits a `SCRAPE_SOURCES`-style csv into normalized ids, or undefined if empty. */
function parseSourceList(csv: string | undefined): string[] | undefined {
  if (!csv) return undefined;
  const ids = csv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

/** Picks the requested sources by id, in the requested order, erroring on an unknown id. */
function selectSources(
  all: readonly MarketplaceSource[],
  ids: readonly string[],
): MarketplaceSource[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  return ids.map((id) => {
    const source = byId.get(id as MarketplaceSource['id']);
    if (!source) {
      throw new Error(
        `Unknown source "${id}". Known sources: ${[...byId.keys()].join(', ')}.`,
      );
    }
    return source;
  });
}

/**
 * On Vercel, Chromium ships as a Lambda layer via @sparticuz/chromium and
 * is driven by playwright-core. Everywhere else, the normal Playwright
 * install drives a locally-installed Chromium.
 */
function createBrowserManager(env: Env): BrowserManager {
  if (process.env['VERCEL']) {
    return new ServerlessPlaywrightBrowserManager();
  }
  return new PlaywrightBrowserManager(env.PLAYWRIGHT_HEADLESS);
}
