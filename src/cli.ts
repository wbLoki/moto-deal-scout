#!/usr/bin/env node
import 'dotenv/config';
import pino from 'pino';
import { Command } from 'commander';
import { loadEnv } from './config/env.js';
import { CronScheduler } from './infrastructure/scheduler/CronScheduler.js';
import { runReport, runScan } from './runners.js';

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
    await runScan();
  });

program
  .command('report')
  .description("Re-send today's good-deal digest from storage, without scanning again")
  .action(async () => {
    await runReport();
  });

program
  .command('schedule')
  .description(
    'Start the cron scheduler (default 8:00 AM Africa/Casablanca) and keep the process running',
  )
  .action(() => {
    const env = loadEnv();
    const logger = pino({
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty' } } : {}),
    });
    const scheduler = new CronScheduler(env.SCAN_CRON_EXPRESSION, env.SCAN_TIMEZONE, logger);

    scheduler.start(async () => {
      await runScan();
    });

    const shutdown = (): void => {
      scheduler.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
