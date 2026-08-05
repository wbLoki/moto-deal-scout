import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleNotificationProvider } from '../../src/infrastructure/notifications/ConsoleNotificationProvider.js';
import type { DailyReport } from '../../src/domain/entities/DailyReport.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

function buildScored(): ScoredListing {
  return {
    listing: makeListing(),
    match: { criteria: makeModelCriteria(), confidence: 0.9 },
    score: { price: 30, mileage: 20, year: 15, city: 10, total: 75, reasons: [] },
    isGoodDeal: true,
  };
}

describe('ConsoleNotificationProvider', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints nothing extra when there are no good deals', async () => {
    const provider = new ConsoleNotificationProvider();
    await provider.notifyGoodDeals([]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('prints each good deal', async () => {
    const provider = new ConsoleNotificationProvider();
    await provider.notifyGoodDeals([buildScored()]);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('good deal');
  });

  it('always prints the daily report, even with zero deals', async () => {
    const provider = new ConsoleNotificationProvider();
    const report: DailyReport = {
      runAt: new Date(),
      sources: [],
      totalListingsScanned: 0,
      newListingsSeen: 0,
      goodDeals: [],
      priceDrops: [],
    };
    await provider.sendDailyReport(report);
    expect(logSpy).toHaveBeenCalled();
  });
});
