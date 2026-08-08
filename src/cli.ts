#!/usr/bin/env node
import 'dotenv/config';
import pino from 'pino';
import { Command } from 'commander';
import { loadEnv } from './config/env.js';
import { CronScheduler } from './infrastructure/scheduler/CronScheduler.js';
import { runDiscovery, runDiscoveryDryRun, runReport, runScan } from './runners.js';

const program = new Command();
program
  .name('moto-deal-scout')
  .description(
    'Daily scanner for Moroccan motorcycle marketplaces — notifies you about good deals only',
  );

const parseSources = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

program
  .command('scan')
  .description('Run one scan immediately, persist results, and notify about any good deals found')
  .option('--source <ids>', 'Only scrape these marketplaces (csv, e.g. "avito")', parseSources)
  .action(async (opts: { source?: string[] }) => {
    await runScan(opts.source ? { sources: opts.source } : {});
  });

program
  .command('discover')
  .description(
    'Crawl both marketplaces end to end, auto-create any catalog models found, and score the listings',
  )
  .option('--max-pages <n>', 'How deep to paginate each source', (v) => Number.parseInt(v, 10))
  .option('--source <ids>', 'Only scrape these marketplaces (csv, e.g. "avito")', parseSources)
  .option('--full', 'Ignore the last-scrape watermark and crawl every page (full re-crawl)')
  .option('--dry-run', 'Only print how titles would resolve; write nothing to the database')
  .action(async (opts: { maxPages?: number; source?: string[]; full?: boolean; dryRun?: boolean }) => {
    const sources = opts.source ? { sources: opts.source } : {};
    if (opts.dryRun) {
      await runDiscoveryDryRun(opts.maxPages, sources);
      return;
    }
    await runDiscovery(opts.maxPages, { ...sources, ...(opts.full ? { full: true } : {}) });
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
