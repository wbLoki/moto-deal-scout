import { describe, expect, it } from 'vitest';
import { newDealNotifications, priceDropNotifications, shouldSendFreeWeeklyWhatsApp } from '../../src/alerts.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import type { PriceDrop } from '../../src/domain/entities/DailyReport.js';
import type { Listing } from '../../src/domain/entities/Listing.js';
import type { SavedSearch } from '../../src/domain/entities/SavedSearch.js';
import type { ModelCriteria } from '../../src/domain/entities/SearchCriteria.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

function scored(listing: Partial<Listing>, criteria: Partial<ModelCriteria>): ScoredListing {
  return {
    listing: makeListing(listing),
    match: { criteria: makeModelCriteria(criteria), confidence: 0.9 },
    score: { price: 40, mileage: 20, year: 15, city: 10, total: 85, reasons: [] },
    isGoodDeal: true,
  };
}

function search(over: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 's1',
    userId: 'u1',
    name: 'Motos',
    vehicleType: 'motorcycle',
    budgetMin: 0,
    budgetMax: 1_000_000,
    yearMin: 2000,
    yearMax: 2100,
    mileageMax: 0,
    brands: [],
    cities: [],
    fuelTypes: [],
    gearboxes: [],
    modelIds: [],
    ...over,
  };
}

describe('newDealNotifications', () => {
  it('creates one notification per user whose saved search matches the deal', () => {
    const deal = scored({ priceMAD: 70000 }, { id: 'yamaha-mt07' });
    const searches = [search({ id: 'a', userId: 'u1' }), search({ id: 'b', userId: 'u2' })];

    const rows = newDealNotifications([deal], searches);

    expect(rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
    expect(rows[0]).toMatchObject({ type: 'new_deal', modelId: 'yamaha-mt07', priceMAD: 70000 });
  });

  it('skips a user whose saved search excludes the deal', () => {
    const deal = scored({ priceMAD: 90000 }, { id: 'yamaha-mt07' });
    const tight = search({ budgetMax: 80000 });

    expect(newDealNotifications([deal], [tight])).toHaveLength(0);
  });

  it('ignores deals that match nobody’s searches', () => {
    const deal = scored({}, { id: 'honda-cb500f' });
    expect(newDealNotifications([deal], [])).toHaveLength(0);
  });

  it('never alerts a car listing against a motorcycle search', () => {
    const deal = scored(
      { priceMAD: 250000, vehicleType: 'car' },
      { id: 'dacia-duster', vehicleType: 'car', brand: 'Dacia' },
    );
    const motoSearch = search({ userId: 'u1', vehicleType: 'motorcycle', budgetMax: 600000 });
    expect(newDealNotifications([deal], [motoSearch])).toHaveLength(0);
  });

  it('alerts a car listing against a car search', () => {
    const deal = scored(
      { priceMAD: 250000, vehicleType: 'car' },
      { id: 'dacia-duster', vehicleType: 'car', brand: 'Dacia' },
    );
    const carSearch = search({
      userId: 'u1',
      vehicleType: 'car',
      budgetMax: 600000,
    });
    expect(newDealNotifications([deal], [carSearch])).toHaveLength(1);
  });
});

function drop(
  over: Partial<Listing>,
  model: Partial<ModelCriteria>,
  prices: { old: number; now: number },
): PriceDrop {
  return {
    listing: makeListing({ ...over }),
    model: makeModelCriteria(model),
    oldPriceMAD: prices.old,
    newPriceMAD: prices.now,
  };
}

describe('priceDropNotifications', () => {
  it('always alerts savers of the listing, plus users whose search matches', () => {
    const d = drop(
      { sourceId: 'avito', externalId: '9', priceMAD: 60000 },
      { id: 'yamaha-mt07' },
      { old: 72000, now: 60000 },
    );
    const searches = [search({ userId: 'w1' })];
    const savers = new Map([['avito:9', ['s1']]]);

    const rows = priceDropNotifications([d], searches, savers);

    expect(rows.map((r) => r.userId).sort()).toEqual(['s1', 'w1']);
    expect(rows[0]).toMatchObject({ type: 'price_drop', oldPriceMAD: 72000, priceMAD: 60000 });
  });

  it('alerts a saver even when the drop is outside their search, but not an out-of-range searcher', () => {
    const d = drop(
      { sourceId: 'avito', externalId: '9', priceMAD: 90000 },
      { id: 'yamaha-mt07' },
      { old: 99000, now: 90000 },
    );
    const tight = search({ userId: 'w1', budgetMax: 80000 });
    const savers = new Map([['avito:9', ['s1']]]);

    const rows = priceDropNotifications([d], [tight], savers);

    expect(rows.map((r) => r.userId)).toEqual(['s1']);
  });
});

describe('shouldSendFreeWeeklyWhatsApp', () => {
  const now = new Date('2026-08-14T08:00:00.000Z');

  it('sends when the user has never been WhatsApp’d', () => {
    expect(shouldSendFreeWeeklyWhatsApp(undefined, now)).toBe(true);
    expect(shouldSendFreeWeeklyWhatsApp(null, now)).toBe(true);
  });

  it('waits a week after the last send', () => {
    expect(shouldSendFreeWeeklyWhatsApp('2026-08-10T08:00:00.000Z', now)).toBe(false);
    expect(shouldSendFreeWeeklyWhatsApp('2026-08-07T08:00:00.000Z', now)).toBe(true);
  });
});
