import type { Logger } from 'pino';
import type { DailyReport } from '../../domain/entities/DailyReport.js';
import type { NotificationProvider } from '../../domain/interfaces/NotificationProvider.js';

/**
 * Fans a scan result out to every configured notification provider. A
 * failure in one provider (e.g. Discord webhook down) is logged and
 * swallowed so it never blocks the others.
 */
export class NotificationDispatcher {
  constructor(
    private readonly providers: readonly NotificationProvider[],
    private readonly logger: Logger,
  ) {}

  async dispatch(report: DailyReport): Promise<void> {
    await Promise.all(
      this.providers.map(async (provider) => {
        try {
          if (report.goodDeals.length > 0) {
            await provider.notifyGoodDeals(report.goodDeals);
          }
          await provider.sendDailyReport(report);
        } catch (err) {
          this.logger.error({ err, provider: provider.id }, 'notification provider failed');
        }
      }),
    );
  }
}
