#!/usr/bin/env node
import { Command } from 'commander';
import { buildContainer } from './container.js';
import { loadEnv } from './config/env.js';
import { CronScheduler } from './infrastructure/scheduler/CronScheduler.js';

const program = new Command();
program
  .name('moto-deal-scout')
  .description(
    'Daily scanner for Moroccan motorcycle marketplaces — notifies you about good deals only',
  );

program
  .command('scan')
  .description('Run one scan immediately, persist results, and notify about any good deals found')
  .action(async () => {
    const container = await buildContainer();
    try {
      const report = await container.scanner.scan();
      await container.dispatcher.dispatch(report);
    } finally {
      await container.shutdown();
    }
  });

program
  .command('report')
  .description("Re-send today's good-deal digest from storage, without scanning again")
  .action(async () => {
    const container = await buildContainer();
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const report = await container.reportService.buildSince(startOfToday);
      await container.dispatcher.dispatch(report);
    } finally {
      await container.shutdown();
    }
  });

program
  .command('schedule')
  .description(
    'Start the cron scheduler (default 8:00 AM Africa/Casablanca) and keep the process running',
  )
  .action(async () => {
    const container = await buildContainer();
    const env = loadEnv();
    const scheduler = new CronScheduler(
      env.SCAN_CRON_EXPRESSION,
      env.SCAN_TIMEZONE,
      container.logger,
    );

    scheduler.start(async () => {
      const report = await container.scanner.scan();
      await container.dispatcher.dispatch(report);
    });

    const shutdown = (): void => {
      scheduler.stop();
      container
        .shutdown()
        .catch((err: unknown) => container.logger.error({ err }, 'error during shutdown'))
        .finally(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
