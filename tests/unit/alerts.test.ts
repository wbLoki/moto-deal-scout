import { describe, expect, it } from 'vitest';
import { newDealNotifications, priceDropNotifications } from '../../src/alerts.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import type { PriceDrop } from '../../src/domain/entities/DailyReport.js';
import type { Listing } from '../../src/domain/entities/Listing.js';
import type { ModelCriteria, SearchRange } from '../../src/domain/entities/SearchCriteria.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

function scored(listing: Partial<Listing>, criteria: Partial<ModelCriteria>): ScoredListing {
  return {
    listing: makeListing(listing),
    match: { criteria: makeModelCriteria(criteria), confidence: 0.9 },
    score: { price: 40, mileage: 20, year: 15, city: 10, total: 85, reasons: [] },
    isGoodDeal: true,
  };
}

const wide: SearchRange = { budgetMin: 0, budgetMax: 1_000_000, yearMin: 2000, yearMax: 2100 };

describe('newDealNotifications', () => {
  it('creates one in-range notification per watcher of the deal’s model', () => {
    const deal = scored({ priceMAD: 70000 }, { id: 'yamaha-mt07' });
    const watchers = new Map([['yamaha-mt07', ['u1', 'u2']]]);

    const rows = newDealNotifications([deal], watchers, () => wide);

    expect(rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
    expect(rows[0]).toMatchObject({ type: 'new_deal', modelId: 'yamaha-mt07', priceMAD: 70000 });
  });

  it('skips a watcher whose saved range excludes the deal', () => {
    const deal = scored({ priceMAD: 90000 }, { id: 'yamaha-mt07' });
    const watchers = new Map([['yamaha-mt07', ['u1']]]);
    const tight: SearchRange = { budgetMin: 0, budgetMax: 80000, yearMin: 2000, yearMax: 2100 };

    expect(newDealNotifications([deal], watchers, () => tight)).toHaveLength(0);
  });

  it('ignores deals for models nobody watches', () => {
    const deal = scored({}, { id: 'honda-cb500f' });
    expect(newDealNotifications([deal], new Map(), () => wide)).toHaveLength(0);
  });

  it('applies the search range for the deal’s vehicle type', () => {
    const deal = scored({ priceMAD: 250000, vehicleType: 'car' }, { id: 'dacia-duster', vehicleType: 'car' });
    const watchers = new Map([['dacia-duster', ['u1']]]);
    const motoTight: SearchRange = { budgetMin: 0, budgetMax: 80000, yearMin: 2000, yearMax: 2100 };
    const carWide: SearchRange = { budgetMin: 0, budgetMax: 600000, yearMin: 2000, yearMax: 2100 };
    const rangeFor = (_userId: string, vehicleType: 'motorcycle' | 'car') =>
      vehicleType === 'car' ? carWide : motoTight;
    expect(newDealNotifications([deal], watchers, rangeFor)).toHaveLength(1);
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
  it('always alerts savers of the listing, plus in-range watchers of the model', () => {
    const d = drop(
      { sourceId: 'avito', externalId: '9', priceMAD: 60000 },
      { id: 'yamaha-mt07' },
      {
        old: 72000,
        now: 60000,
      },
    );
    const watchers = new Map([['yamaha-mt07', ['w1']]]);
    const savers = new Map([['avito:9', ['s1']]]);

    const rows = priceDropNotifications([d], watchers, savers, () => wide);

    expect(rows.map((r) => r.userId).sort()).toEqual(['s1', 'w1']);
    expect(rows[0]).toMatchObject({ type: 'price_drop', oldPriceMAD: 72000, priceMAD: 60000 });
  });

  it('alerts a saver even when the drop is outside their range, but not an out-of-range watcher', () => {
    const d = drop(
      { sourceId: 'avito', externalId: '9', priceMAD: 90000 },
      { id: 'yamaha-mt07' },
      {
        old: 99000,
        now: 90000,
      },
    );
    const tight: SearchRange = { budgetMin: 0, budgetMax: 80000, yearMin: 2000, yearMax: 2100 };
    const watchers = new Map([['yamaha-mt07', ['w1']]]);
    const savers = new Map([['avito:9', ['s1']]]);

    const rows = priceDropNotifications([d], watchers, savers, () => tight);

    expect(rows.map((r) => r.userId)).toEqual(['s1']);
  });
});
