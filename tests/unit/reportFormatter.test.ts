import { describe, expect, it } from 'vitest';
import type { DailyReport } from '../../src/domain/entities/DailyReport.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import {
  formatDailyReportText,
  formatListingLine,
} from '../../src/application/services/reportFormatter.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

function buildScored(): ScoredListing {
  return {
    listing: makeListing(),
    match: { criteria: makeModelCriteria(), confidence: 0.9 },
    score: { price: 30, mileage: 20, year: 15, city: 10, total: 75, reasons: [] },
    isGoodDeal: true,
  };
}

describe('formatListingLine', () => {
  it('includes score, price, city and the listing URL', () => {
    const line = formatListingLine(buildScored());
    expect(line).toContain('75/100');
    expect(line).toContain('70000 MAD');
    expect(line).toContain('Casablanca');
    expect(line).toContain('https://www.avito.ma');
  });
});

describe('formatDailyReportText', () => {
  it('reports "no good deals" when there are none', () => {
    const report: DailyReport = {
      runAt: new Date('2024-01-01T08:00:00Z'),
      sources: [{ sourceId: 'avito', listingsFound: 5, newListings: 0, error: undefined }],
      totalListingsScanned: 5,
      newListingsSeen: 0,
      goodDeals: [],
      priceDrops: [],
    };
    const text = formatDailyReportText(report);
    expect(text).toContain('No good deals today.');
  });

  it('lists every good deal and surfaces per-source errors', () => {
    const report: DailyReport = {
      runAt: new Date('2024-01-01T08:00:00Z'),
      sources: [{ sourceId: 'biker', listingsFound: 0, newListings: 0, error: 'timeout' }],
      totalListingsScanned: 3,
      newListingsSeen: 1,
      goodDeals: [buildScored()],
      priceDrops: [],
    };
    const text = formatDailyReportText(report);
    expect(text).toContain('1 good deal(s)');
    expect(text).toContain('ERROR: timeout');
  });
});
