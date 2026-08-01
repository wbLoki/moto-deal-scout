import type { DailyReport } from '../../domain/entities/DailyReport.js';
import type { ScoredListing } from '../../domain/entities/ScoredListing.js';
import type { NotificationProvider } from '../../domain/interfaces/NotificationProvider.js';
import {
  formatDailyReportText,
  formatListingLine,
} from '../../application/services/reportFormatter.js';

/** Prints to stdout. Always safe to include — useful on its own or alongside Discord. */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly id = 'console';

  notifyGoodDeals(deals: readonly ScoredListing[]): Promise<void> {
    if (deals.length > 0) {
      console.log(`\n=== ${deals.length} good deal(s) ===`);
      for (const deal of deals) {
        console.log(formatListingLine(deal));
        console.log('');
      }
    }
    return Promise.resolve();
  }

  sendDailyReport(report: DailyReport): Promise<void> {
    console.log(formatDailyReportText(report));
    return Promise.resolve();
  }
}
