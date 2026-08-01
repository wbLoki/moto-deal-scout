import type { DailyReport } from '../entities/DailyReport.js';
import type { ScoredListing } from '../entities/ScoredListing.js';

/**
 * Implement this for every place we want to send alerts (Discord, email,
 * SMS, push, ...). Providers should not throw on delivery failure — log
 * and swallow, so one bad channel doesn't stop others from firing.
 */
export interface NotificationProvider {
  readonly id: string;

  /** Called once per run with only the listings that cleared the good-deal bar. */
  notifyGoodDeals(deals: readonly ScoredListing[]): Promise<void>;

  /** Called once per run regardless of whether any good deals were found. */
  sendDailyReport(report: DailyReport): Promise<void>;
}
