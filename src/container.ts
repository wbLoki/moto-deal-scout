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
import { MoteurSource } from './infrastructure/sources/moteur/MoteurSource.js';
import { ConsoleNotificationProvider } from './infrastructure/notifications/ConsoleNotificationProvider.js';
import { DiscordNotificationProvider } from './infrastructure/notifications/DiscordNotificationProvider.js';
import { openDatabase, type DatabaseConfig } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlSettingsRepository } from './infrastructure/persistence/libsql/LibsqlSettingsRepository.js';
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

export async function buildContainer(): Promise<Container> {
  const env = loadEnv();
  const logger = pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty' } } : {}),
  });

  const baseCriteria = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));

  // A stored search range (set via the settings UI) overrides whatever the
  // criteria config shipped with, so scans honour the latest saved value.
  const settingsRepo = new LibsqlSettingsRepository(db);
  const storedRange = await settingsRepo.getSearchRange();
  const criteria: SearchCriteria = storedRange
    ? { ...baseCriteria, global: { ...baseCriteria.global, searchRange: storedRange } }
    : baseCriteria;

  const repository = new LibsqlListingRepository(db, criteria.models, logger);

  const browserManager = createBrowserManager(env);
  const sourceOptions = { throttleMs: env.SCRAPE_THROTTLE_MS };
  const sources: MarketplaceSource[] = [
    new AvitoSource(browserManager, sourceOptions, logger.child({ source: 'avito' })),
    new BikerSource(browserManager, sourceOptions, logger.child({ source: 'biker' })),
    new MoteurSource(browserManager, sourceOptions, logger.child({ source: 'moteur' })),
  ];

  const notifiers: NotificationProvider[] = [
    new ConsoleNotificationProvider(),
    new DiscordNotificationProvider(env.DISCORD_WEBHOOK_URL, logger.child({ notifier: 'discord' })),
  ];

  const scanner = new DealScanner({ sources, repository, criteria, logger });
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

/**
 * Prefers an explicit DATABASE_URL (Turso on Vercel); otherwise derives a
 * local `file:` URL from DATABASE_PATH so the CLI works with zero config.
 */
export function resolveDatabaseConfig(env: Env): DatabaseConfig {
  if (env.DATABASE_URL) {
    return env.DATABASE_AUTH_TOKEN
      ? { url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN }
      : { url: env.DATABASE_URL };
  }
  return { url: `file:${env.DATABASE_PATH}` };
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
