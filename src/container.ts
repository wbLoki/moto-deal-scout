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
import { openDatabase } from './infrastructure/persistence/sqlite/Database.js';
import { SqliteListingRepository } from './infrastructure/persistence/sqlite/SqliteListingRepository.js';
import { PlaywrightBrowserManager } from './infrastructure/sources/shared/PlaywrightBrowserManager.js';

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

  const criteria = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = openDatabase(env.DATABASE_PATH);
  const repository = new SqliteListingRepository(db, criteria.models, logger);

  const browserManager = new PlaywrightBrowserManager(env.PLAYWRIGHT_HEADLESS);
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
