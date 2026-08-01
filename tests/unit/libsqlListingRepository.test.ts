import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from '../../src/infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

function buildScored(overrides: Partial<ScoredListing> = {}): ScoredListing {
  return {
    listing: makeListing(),
    match: { criteria: makeModelCriteria(), confidence: 0.9 },
    score: { price: 30, mileage: 20, year: 15, city: 10, total: 75, reasons: ['test'] },
    isGoodDeal: true,
    ...overrides,
  };
}

describe('LibsqlListingRepository', () => {
  let db: Client;
  let repo: LibsqlListingRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    repo = new LibsqlListingRepository(db, [makeModelCriteria()]);
  });

  afterEach(() => {
    db.close();
  });

  it('reports a listing as unseen before it has been saved', async () => {
    await expect(repo.hasSeen('avito', '12345')).resolves.toBe(false);
  });

  it('reports a listing as seen after saving it', async () => {
    await repo.save(buildScored());
    await expect(repo.hasSeen('avito', '12345')).resolves.toBe(true);
  });

  it('upserts on repeated saves of the same listing instead of erroring', async () => {
    await repo.save(buildScored());
    await expect(
      repo.save(
        buildScored({
          score: { price: 40, mileage: 20, year: 15, city: 10, total: 85, reasons: [] },
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('returns good deals saved since a given date, most recent first', async () => {
    await repo.save(buildScored({ listing: makeListing({ externalId: 'a' }), isGoodDeal: true }));
    await repo.save(buildScored({ listing: makeListing({ externalId: 'b' }), isGoodDeal: false }));

    const goodDeals = await repo.getGoodDealsSince(new Date('2000-01-01'));

    expect(goodDeals).toHaveLength(1);
    expect(goodDeals[0]?.listing.externalId).toBe('a');
  });

  it('excludes good deals from before the given date', async () => {
    await repo.save(buildScored({ listing: makeListing({ externalId: 'c' }), isGoodDeal: true }));

    const future = new Date(Date.now() + 86_400_000);
    const goodDeals = await repo.getGoodDealsSince(future);

    expect(goodDeals).toHaveLength(0);
  });

  it('getRecentGoodDeals returns only good deals, capped at the limit', async () => {
    await repo.save(buildScored({ listing: makeListing({ externalId: 'g1' }), isGoodDeal: true }));
    await repo.save(buildScored({ listing: makeListing({ externalId: 'g2' }), isGoodDeal: true }));
    await repo.save(
      buildScored({ listing: makeListing({ externalId: 'bad' }), isGoodDeal: false }),
    );

    const recent = await repo.getRecentGoodDeals(1);

    expect(recent).toHaveLength(1);
    expect(recent[0]?.isGoodDeal).toBe(true);
  });

  it('round-trips score breakdown and model match through storage', async () => {
    const scored = buildScored();
    await repo.save(scored);

    const [result] = await repo.getGoodDealsSince(new Date('2000-01-01'));

    expect(result?.score).toEqual(scored.score);
    expect(result?.match.criteria.id).toBe(scored.match.criteria.id);
    expect(result?.match.confidence).toBeCloseTo(scored.match.confidence);
  });

  it('skips rows whose matched model id is no longer in the current criteria', async () => {
    const otherModel = makeModelCriteria({ id: 'ghost-model' });
    await repo.save(buildScored({ match: { criteria: otherModel, confidence: 0.8 } }));

    const goodDeals = await repo.getGoodDealsSince(new Date('2000-01-01'));

    expect(goodDeals).toHaveLength(0);
  });
});
