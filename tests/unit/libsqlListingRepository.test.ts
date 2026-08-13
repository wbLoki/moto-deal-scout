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

  it('refreshMissingImage fills a null image_url and ignores a real one', async () => {
    await repo.save(buildScored({ listing: makeListing({ externalId: 'img-a', imageUrl: undefined }) }));
    await repo.refreshMissingImage(
      'avito',
      'img-a',
      'https://content.avito.ma/classifieds/images/1?t=images',
    );
    const filled = await repo.findBySourceExternalId('avito', 'img-a');
    expect(filled?.listing.imageUrl).toBe('https://content.avito.ma/classifieds/images/1?t=images');

    await repo.refreshMissingImage('avito', 'img-a', 'https://example.com/other.jpg');
    const kept = await repo.findBySourceExternalId('avito', 'img-a');
    expect(kept?.listing.imageUrl).toBe('https://content.avito.ma/classifieds/images/1?t=images');
  });

  it('refreshMissingImage replaces a stored seller portrait', async () => {
    await repo.save(
      buildScored({
        listing: makeListing({
          externalId: 'img-seller',
          imageUrl: 'https://content.avito.ma/users/42.jpg',
        }),
      }),
    );
    await repo.refreshMissingImage(
      'avito',
      'img-seller',
      'https://content.avito.ma/classifieds/images/9?t=images',
    );
    const filled = await repo.findBySourceExternalId('avito', 'img-seller');
    expect(filled?.listing.imageUrl).toBe(
      'https://content.avito.ma/classifieds/images/9?t=images',
    );
  });

  it('excludes good deals from before the given date', async () => {
    await repo.save(buildScored({ listing: makeListing({ externalId: 'c' }), isGoodDeal: true }));

    const future = new Date(Date.now() + 86_400_000);
    const goodDeals = await repo.getGoodDealsSince(future);

    expect(goodDeals).toHaveLength(0);
  });

  it('getRecentListings returns listings of any tier', async () => {
    await repo.save(
      buildScored({ listing: makeListing({ externalId: 'good' }), isGoodDeal: true }),
    );
    await repo.save(
      buildScored({ listing: makeListing({ externalId: 'meh' }), isGoodDeal: false }),
    );

    const all = await repo.getRecentListings(50);
    const good = await repo.getRecentGoodDeals(50);

    expect(all.map((d) => d.listing.externalId).sort()).toEqual(['good', 'meh']);
    expect(good.map((d) => d.listing.externalId)).toEqual(['good']);
  });

  it('getTopScoredListings orders by score, not insert time', async () => {
    // A late-inserted low scorer must not bury an earlier high scorer — this
    // is what kept old listings visible after a large discovery batch landed.
    await repo.save(
      buildScored({
        listing: makeListing({ externalId: 'old-great' }),
        score: { price: 40, mileage: 20, year: 15, city: 10, total: 90, reasons: [] },
      }),
    );
    await repo.save(
      buildScored({
        listing: makeListing({ externalId: 'new-meh' }),
        score: { price: 10, mileage: 5, year: 5, city: 5, total: 30, reasons: [] },
      }),
    );

    const top = await repo.getTopScoredListings(50);
    expect(top.map((d) => d.listing.externalId)).toEqual(['old-great', 'new-meh']);
  });

  it('getListingsSince returns any-tier listings since the date', async () => {
    await repo.save(buildScored({ listing: makeListing({ externalId: 'x' }), isGoodDeal: false }));
    await expect(repo.getListingsSince(new Date('2000-01-01'))).resolves.toHaveLength(1);
    await expect(repo.getListingsSince(new Date(Date.now() + 86_400_000))).resolves.toHaveLength(0);
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
