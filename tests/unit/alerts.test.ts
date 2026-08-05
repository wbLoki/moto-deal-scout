import { describe, expect, it } from 'vitest';
import { newDealNotifications } from '../../src/alerts.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
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
});
