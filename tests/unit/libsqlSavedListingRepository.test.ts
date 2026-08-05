import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from '../../src/infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlSavedListingRepository } from '../../src/infrastructure/persistence/libsql/LibsqlSavedListingRepository.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

const model = makeModelCriteria({ id: 'yamaha-mt07' });

function scored(externalId: string): ScoredListing {
  return {
    listing: makeListing({ sourceId: 'avito', externalId }),
    match: { criteria: model, confidence: 0.9 },
    score: { price: 40, mileage: 20, year: 15, city: 10, total: 85, reasons: [] },
    isGoodDeal: true,
  };
}

describe('LibsqlSavedListingRepository', () => {
  let db: Client;
  let repo: LibsqlSavedListingRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    await db.execute({
      sql: 'INSERT INTO users (id, email) VALUES (?, ?)',
      args: ['u1', 'u1@x.co'],
    });
    // A stored listing to join against.
    await new LibsqlListingRepository(db, [model]).save(scored('1'));
    repo = new LibsqlSavedListingRepository(db, [model]);
  });

  afterEach(() => {
    db.close();
  });

  it('adds (idempotently) and lists saved keys', async () => {
    await repo.add('u1', 'avito', '1');
    await repo.add('u1', 'avito', '1');
    expect(await repo.listSavedKeys('u1')).toEqual(['avito:1']);
  });

  it('returns saved listings as full scored deals', async () => {
    await repo.add('u1', 'avito', '1');
    const deals = await repo.listSavedDeals('u1');
    expect(deals).toHaveLength(1);
    expect(deals[0]?.match.criteria.id).toBe('yamaha-mt07');
    expect(deals[0]?.listing.externalId).toBe('1');
  });

  it('removes a saved listing', async () => {
    await repo.add('u1', 'avito', '1');
    await repo.remove('u1', 'avito', '1');
    expect(await repo.listSavedKeys('u1')).toEqual([]);
    expect(await repo.listSavedDeals('u1')).toHaveLength(0);
  });
});
