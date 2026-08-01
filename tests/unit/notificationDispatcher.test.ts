import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { NotificationDispatcher } from '../../src/application/services/NotificationDispatcher.js';
import type { DailyReport } from '../../src/domain/entities/DailyReport.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import type { NotificationProvider } from '../../src/domain/interfaces/NotificationProvider.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

const silentLogger = pino({ level: 'silent' });

function buildReport(goodDeals: ScoredListing[]): DailyReport {
  return {
    runAt: new Date(),
    sources: [],
    totalListingsScanned: 0,
    newListingsSeen: goodDeals.length,
    goodDeals,
  };
}

function buildScored(): ScoredListing {
  return {
    listing: makeListing(),
    match: { criteria: makeModelCriteria(), confidence: 0.9 },
    score: { price: 30, mileage: 20, year: 15, city: 10, total: 75, reasons: [] },
    isGoodDeal: true,
  };
}

describe('NotificationDispatcher', () => {
  it('calls notifyGoodDeals and sendDailyReport on every provider when there are deals', async () => {
    const calls: string[] = [];
    const provider: NotificationProvider = {
      id: 'test',
      notifyGoodDeals: (deals) => {
        calls.push(`notify:${deals.length}`);
        return Promise.resolve();
      },
      sendDailyReport: () => {
        calls.push('report');
        return Promise.resolve();
      },
    };
    const dispatcher = new NotificationDispatcher([provider], silentLogger);

    await dispatcher.dispatch(buildReport([buildScored()]));

    expect(calls).toEqual(['notify:1', 'report']);
  });

  it('skips notifyGoodDeals but still sends the report when there are no deals', async () => {
    const calls: string[] = [];
    const provider: NotificationProvider = {
      id: 'test',
      notifyGoodDeals: () => {
        calls.push('notify');
        return Promise.resolve();
      },
      sendDailyReport: () => {
        calls.push('report');
        return Promise.resolve();
      },
    };
    const dispatcher = new NotificationDispatcher([provider], silentLogger);

    await dispatcher.dispatch(buildReport([]));

    expect(calls).toEqual(['report']);
  });

  it('does not let one failing provider stop the others', async () => {
    const calls: string[] = [];
    const failing: NotificationProvider = {
      id: 'failing',
      notifyGoodDeals: () => Promise.reject(new Error('nope')),
      sendDailyReport: () => Promise.reject(new Error('nope')),
    };
    const working: NotificationProvider = {
      id: 'working',
      notifyGoodDeals: () => {
        calls.push('working-notify');
        return Promise.resolve();
      },
      sendDailyReport: () => {
        calls.push('working-report');
        return Promise.resolve();
      },
    };
    const dispatcher = new NotificationDispatcher([failing, working], silentLogger);

    await expect(dispatcher.dispatch(buildReport([buildScored()]))).resolves.toBeUndefined();
    expect(calls).toEqual(['working-notify', 'working-report']);
  });
});
