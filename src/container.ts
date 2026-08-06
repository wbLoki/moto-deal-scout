import pino from 'pino';
import { DailyReportService } from './application/services/DailyReportService.js';
import { DealScanner } from './application/services/DealScanner.js';
import { NotificationDispatcher } from './application/services/NotificationDispatcher.js';
import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import type { SearchCriteria } from './domain/entities/SearchCriteria.js';
import type { ListingRepository } from './domain/interfaces/ListingRepository.js';
import type { MarketplaceSource } from './domain/interfaces/MarketplaceSource.js';
import type { NotificationProvider } from './domain/interfaces/NotificationProvider.js';
import { AvitoSource } from './infrastructure/sources/avito/AvitoSource.js';
import { BikerSource } from './infrastructure/sources/biker/BikerSource.js';
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
  readonly discovery?: { readonly maxPages?: number };
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
  const db = await openDatabase(resolveDatabaseConfig(env));
  const modelRepo = new LibsqlModelRepository(db);
  await modelRepo.seedIfEmpty(config.models);
  const enabledModels = await modelRepo.listEnabledCriteria();
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
  const sourceOptions = { throttleMs: env.SCRAPE_THROTTLE_MS };
  const sources: MarketplaceSource[] = [
    new AvitoSource(browserManager, sourceOptions, logger.child({ source: 'avito' })),
    new BikerSource(browserManager, sourceOptions, logger.child({ source: 'biker' })),
  ];

  const notifiers: NotificationProvider[] = [
    new ConsoleNotificationProvider(),
    new DiscordNotificationProvider(env.DISCORD_WEBHOOK_URL, logger.child({ notifier: 'discord' })),
  ];

  const scanner = new DealScanner({
    sources,
    repository,
    criteria,
    logger,
    ...(options.discovery
      ? {
          resolver: new CatalogModelResolver(),
          // insertIfAbsent, never upsert: re-discovering an already-calibrated
          // model must not reset its price range back to the provisional one.
          modelSink: (model) => modelRepo.insertIfAbsent(model),
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
