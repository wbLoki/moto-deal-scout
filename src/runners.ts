import { buildContainer } from './container.js';
import type { DailyReport } from './domain/entities/DailyReport.js';

/**
 * Runs one full scan and dispatches notifications, then tears everything
 * down. Shared by the CLI `scan` command and the `/api/scan` cron route so
 * both behave identically.
 */
export async function runScan(): Promise<DailyReport> {
  const container = await buildContainer();
  try {
    const report = await container.scanner.scan();
    await container.dispatcher.dispatch(report);
    return report;
  } finally {
    await container.shutdown();
  }
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
