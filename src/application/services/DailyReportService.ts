import type { DailyReport } from '../../domain/entities/DailyReport.js';
import type { ListingRepository } from '../../domain/interfaces/ListingRepository.js';

/**
 * Rebuilds a {@link DailyReport} from previously-stored good deals, for
 * the `report` CLI command (re-sending today's digest without a rescan).
 * Per-source scan stats aren't available here since no scan ran, so
 * `sources` and `totalListingsScanned` are left empty/zero.
 */
export class DailyReportService {
  constructor(private readonly repository: ListingRepository) {}

  async buildSince(sinceDate: Date): Promise<DailyReport> {
    const goodDeals = await this.repository.getGoodDealsSince(sinceDate);
    return {
      runAt: new Date(),
      sources: [],
      totalListingsScanned: 0,
      newListingsSeen: goodDeals.length,
      goodDeals,
    };
  }
}
