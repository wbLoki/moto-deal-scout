import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoredModel } from '../../src/domain/entities/Model.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import type { SearchRange } from '../../src/domain/entities/SearchCriteria.js';
import type { DealQuery } from '../../src/domain/interfaces/ListingRepository.js';
import type { SavedSearch } from '../../src/domain/entities/SavedSearch.js';
import { openDatabase } from '../../src/infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from '../../src/infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from '../../src/infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlSavedListingRepository } from '../../src/infrastructure/persistence/libsql/LibsqlSavedListingRepository.js';
import { makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

const WIDE_RANGE: SearchRange = {
  budgetMin: 0,
  budgetMax: 10_000_000,
  yearMin: 1990,
  yearMax: 2100,
};

function storedModel(over: Partial<StoredModel> & Pick<StoredModel, 'id' | 'brand' | 'model'>): StoredModel {
  return {
    aliases: [],
    priceRangeMAD: { min: 60000, max: 120000 },
    maxMileageKm: 60000,
    minYear: 2010,
    enabled: true,
    autoCalibrate: true,
    vehicleType: 'motorcycle',
    ...over,
  };
}

function scored(over: {
  externalId: string;
  modelId?: string;
  brand?: string;
  model?: string;
  priceMAD?: number;
  year?: number;
  mileageKm?: number | undefined;
  city?: string;
  total?: number;
  priceMin?: number; // model's calibration floor, for tier reconstruction
  postedAt?: Date; // marketplace publish date; undefined => falls back to created_at
  displacementCc?: number;
}): ScoredListing {
  const total = over.total ?? 75;
  return {
    listing: makeListing({
      externalId: over.externalId,
      priceMAD: over.priceMAD ?? 70000,
      year: over.year ?? 2019,
      mileageKm: over.mileageKm,
      displacementCc: over.displacementCc,
      city: over.city ?? 'Casablanca',
      postedAt: over.postedAt,
    }),
    match: {
      criteria: makeModelCriteria({
        id: over.modelId ?? 'yamaha-mt07',
        brand: over.brand ?? 'Yamaha',
        model: over.model ?? 'MT-07',
        priceRangeMAD: { min: over.priceMin ?? 65000, max: 120000 },
      }),
      confidence: 0.9,
    },
    score: { price: 0, mileage: 0, year: 0, city: 0, total, reasons: [] },
    isGoodDeal: total >= 70,
  };
}

function makeSearch(over: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 's1',
    userId: 'u1',
    name: 'Motos',
    vehicleType: 'motorcycle',
    budgetMin: 0,
    budgetMax: 10_000_000,
    yearMin: 1990,
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

function query(over: Partial<DealQuery> = {}): DealQuery {
  return {
    userId: 'u1',
    tab: 'all',
    vehicleType: 'motorcycle',
    range: WIDE_RANGE,
    minPriceFactor: 0.5,
    savedSearches: [],
    search: '',
    mileageMin: 0,
    mileageMax: 0,
    ccMin: 0,
    ccMax: 0,
    fuelTypes: [],
    gearboxes: [],
    ratings: [],
    cities: [],
    brands: [],
    sort: 'score',
    page: 1,
    pageSize: 24,
    startOfToday: new Date().toISOString().slice(0, 10),
    ...over,
  };
}

describe('LibsqlListingRepository.queryDeals', () => {
  let db: Client;
  let repo: LibsqlListingRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    const models = new LibsqlModelRepository(db);
    await models.upsert(storedModel({ id: 'yamaha-mt07', brand: 'Yamaha', model: 'MT-07' }));
    await models.upsert(storedModel({ id: 'honda-cb500f', brand: 'Honda', model: 'CB500F' }));
    // A provisional (uncalibrated) model: price_min = 0 => its listings are "calibrating".
    await models.upsert(
      storedModel({ id: 'ktm-390', brand: 'KTM', model: '390 Duke', priceRangeMAD: { min: 0, max: 300000 } }),
    );

    const all = await models.listAll();
    repo = new LibsqlListingRepository(db, all);

    await repo.save(scored({ externalId: 'hot', total: 90, priceMAD: 70000, year: 2020, city: 'Casablanca', mileageKm: 10000 }));
    await repo.save(scored({ externalId: 'good', total: 60, priceMAD: 80000, year: 2018, city: 'Rabat', mileageKm: 45000 }));
    await repo.save(scored({ externalId: 'honda', modelId: 'honda-cb500f', brand: 'Honda', model: 'CB500F', total: 82, priceMAD: 55000, year: 2019, city: 'Rabat', mileageKm: undefined }));
    await repo.save(scored({ externalId: 'calib', modelId: 'ktm-390', brand: 'KTM', model: '390 Duke', total: 95, priceMAD: 40000, year: 2021, city: 'Tanger', mileageKm: 5000, priceMin: 0 }));
  });

  afterEach(() => db.close());

  it('returns all in-range listings with a total count', async () => {
    const { deals, total } = await repo.queryDeals(query());
    expect(total).toBe(4);
    expect(deals).toHaveLength(4);
  });

  it('drops listings outside the budget/year range', async () => {
    const { total } = await repo.queryDeals(
      query({ range: { ...WIDE_RANGE, budgetMin: 60000, budgetMax: 100000 } }),
    );
    // 'honda' (55000) and 'calib' (40000) fall below budgetMin.
    expect(total).toBe(2);
  });

  it('drops implausibly-cheap listings against a calibrated model floor', async () => {
    // yamaha floor = 65000 * 1.2 = 78000; only the 80000 'good' listing clears it.
    const { deals } = await repo.queryDeals(query({ minPriceFactor: 1.2, brands: ['yamaha'] }));
    expect(deals.map((d) => d.listing.externalId)).toEqual(['good']);
  });

  it('never filters out a provisional model (price_min = 0) on plausibility', async () => {
    const { deals } = await repo.queryDeals(query({ minPriceFactor: 5, brands: ['ktm'] }));
    expect(deals.map((d) => d.listing.externalId)).toEqual(['calib']);
  });

  it('filters by brand and city (case-insensitive)', async () => {
    expect((await repo.queryDeals(query({ brands: ['honda'] }))).deals.map((d) => d.listing.externalId)).toEqual(['honda']);
    expect((await repo.queryDeals(query({ cities: ['rabat'] }))).total).toBe(2);
  });

  it('searches over brand, model and city', async () => {
    expect((await repo.queryDeals(query({ search: 'honda' }))).total).toBe(1);
    expect((await repo.queryDeals(query({ search: 'tanger' }))).deals[0]?.listing.externalId).toBe('calib');
    expect((await repo.queryDeals(query({ search: 'cb500' }))).total).toBe(1);
  });

  it('passes null-mileage listings through the mileage filter', async () => {
    // 'honda' has no mileage; it must still appear like the year filter's nulls.
    const { deals } = await repo.queryDeals(query({ mileageMin: 0, mileageMax: 20000 }));
    const ids = deals.map((d) => d.listing.externalId).sort();
    expect(ids).toContain('honda'); // null passes
    expect(ids).toContain('hot'); // 10000 within
    expect(ids).not.toContain('good'); // 45000 excluded
  });

  it('filters by displacement (cc); missing cc uses the matched model fallback', async () => {
    await repo.save(scored({ externalId: 'cc125', displacementCc: 125 }));
    await repo.save(scored({ externalId: 'cc650', displacementCc: 650 }));

    const { deals } = await repo.queryDeals(query({ ccMin: 100, ccMax: 200 }));
    const ids = deals.map((d) => d.listing.externalId);
    expect(ids).toContain('cc125');
    expect(ids).not.toContain('cc650');
    // Seeded Yamaha MT-07 rows get the 689cc fallback, so they are out of 100–200.
    expect(ids).not.toContain('hot');
  });

  it('filters by deal-rating tier and the calibrating state', async () => {
    expect((await repo.queryDeals(query({ ratings: ['hot'] }))).deals.map((d) => d.listing.externalId)).toEqual(['hot']);
    // 'calib' scores 95 but its model is uncalibrated, so it's calibrating, not hot.
    expect((await repo.queryDeals(query({ ratings: ['calibrating'] }))).deals.map((d) => d.listing.externalId)).toEqual(['calib']);
    // great = 72..84 → 'honda' (82).
    expect((await repo.queryDeals(query({ ratings: ['great'] }))).deals.map((d) => d.listing.externalId)).toEqual(['honda']);
  });

  it('orders by the requested sort with a stable tiebreak', async () => {
    const asc = await repo.queryDeals(query({ sort: 'price-asc' }));
    expect(asc.deals.map((d) => d.listing.priceMAD)).toEqual([40000, 55000, 70000, 80000]);
    const score = await repo.queryDeals(query({ sort: 'score' }));
    expect(score.deals.map((d) => d.score.total)).toEqual([95, 90, 82, 60]);
  });

  it('sorts the date orders by posted_at, falling back to created_at', async () => {
    // The four seeded listings have no posted_at, so they fall back to
    // created_at (~now). Two more carry explicit, older publish dates.
    await repo.save(scored({ externalId: 'jun', postedAt: new Date('2026-06-01T00:00:00Z') }));
    await repo.save(scored({ externalId: 'jan', postedAt: new Date('2026-01-01T00:00:00Z') }));

    const newest = await repo.queryDeals(query({ sort: 'newest', pageSize: 50 }));
    const ids = newest.deals.map((d) => d.listing.externalId);
    // Newest ad first: the fresh (created_at≈now) ones lead, then Jun, then Jan.
    expect(ids.indexOf('jun')).toBeLessThan(ids.indexOf('jan'));
    expect(ids[ids.length - 1]).toBe('jan');

    const oldest = await repo.queryDeals(query({ sort: 'oldest', pageSize: 50 }));
    expect(oldest.deals[0]?.listing.externalId).toBe('jan');
  });

  it('paginates with limit/offset while reporting the full total', async () => {
    const p1 = await repo.queryDeals(query({ sort: 'price-asc', pageSize: 2, page: 1 }));
    const p2 = await repo.queryDeals(query({ sort: 'price-asc', pageSize: 2, page: 2 }));
    expect(p1.total).toBe(4);
    expect(p1.deals.map((d) => d.listing.priceMAD)).toEqual([40000, 55000]);
    expect(p2.deals.map((d) => d.listing.priceMAD)).toEqual([70000, 80000]);
  });

  it('scopes the watched tab to saved searches, and short-circuits an empty set', async () => {
    const hondaOnly = makeSearch({ modelIds: ['honda-cb500f'] });
    const watched = await repo.queryDeals(query({ tab: 'watched', savedSearches: [hondaOnly] }));
    expect(watched.deals.map((d) => d.listing.externalId)).toEqual(['honda']);
    expect(await repo.queryDeals(query({ tab: 'watched', savedSearches: [] }))).toEqual({
      deals: [],
      total: 0,
    });
  });

  it('includes displacement variants of a watched model on the watched tab', async () => {
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.upsert(storedModel({ id: 'yamaha-nmax', brand: 'Yamaha', model: 'NMAX' }));
    await modelRepo.upsert(
      storedModel({
        id: 'yamaha-nmax-155',
        brand: 'Yamaha',
        model: 'NMAX 155',
        priceRangeMAD: { min: 0, max: 120000 },
      }),
    );
    repo = new LibsqlListingRepository(db, await modelRepo.listAll());
    await repo.save(
      scored({
        externalId: 'nmax155',
        modelId: 'yamaha-nmax-155',
        brand: 'Yamaha',
        model: 'NMAX 155',
        priceMAD: 28000,
        priceMin: 0,
      }),
    );

    const watched = await repo.queryDeals(
      query({ tab: 'watched', savedSearches: [makeSearch({ modelIds: ['yamaha-nmax'] })] }),
    );
    expect(watched.deals.map((d) => d.listing.externalId)).toContain('nmax155');
  });

  it('does not apply sidebar filters on the watched tab', async () => {
    const hondaOnly = makeSearch({ modelIds: ['honda-cb500f'] });
    const watched = await repo.queryDeals(
      query({ tab: 'watched', savedSearches: [hondaOnly], ccMin: 600, ccMax: 800, brands: ['yamaha'] }),
    );
    expect(watched.deals.map((d) => d.listing.externalId)).toEqual(['honda']);
  });

  it('scopes the saved tab to the user bookmarks, ignoring the range', async () => {
    await db.execute({ sql: 'INSERT INTO users (id, email) VALUES (?, ?)', args: ['u1', 'u1@x.co'] });
    await new LibsqlSavedListingRepository(db).add('u1', 'avito', 'good');
    const saved = await repo.queryDeals(
      query({ tab: 'saved', range: { ...WIDE_RANGE, budgetMin: 1_000_000 } }),
    );
    expect(saved.deals.map((d) => d.listing.externalId)).toEqual(['good']);
  });
});

describe('LibsqlListingRepository.countDealsByTab & getDealFacets', () => {
  let db: Client;
  let repo: LibsqlListingRepository;

  beforeEach(async () => {
    db = await openDatabase({ url: ':memory:' });
    const models = new LibsqlModelRepository(db);
    await models.upsert(storedModel({ id: 'yamaha-mt07', brand: 'Yamaha', model: 'MT-07' }));
    await models.upsert(storedModel({ id: 'honda-cb500f', brand: 'Honda', model: 'CB500F' }));
    repo = new LibsqlListingRepository(db, await models.listAll());

    await repo.save(scored({ externalId: 'a', priceMAD: 70000, city: 'Casablanca', mileageKm: 10000, displacementCc: 125 }));
    await repo.save(scored({ externalId: 'b', modelId: 'honda-cb500f', brand: 'Honda', model: 'CB500F', priceMAD: 60000, city: 'rabat', mileageKm: 55000, displacementCc: 500 }));
  });

  afterEach(() => db.close());

  it('counts each tab, respecting the range but not search/filters', async () => {
    const hondaOnly = makeSearch({ modelIds: ['honda-cb500f'] });
    const counts = await repo.countDealsByTab(query({ search: 'nomatch', savedSearches: [hondaOnly] }));
    expect(counts.all).toBe(2);
    expect(counts.daily).toBe(2); // both created just now
    expect(counts.watched).toBe(1);
    expect(counts.saved).toBe(0);
  });

  it('derives filter facets from the whole in-range set', async () => {
    const facets = await repo.getDealFacets(query());
    expect(facets.brands).toEqual(['Honda', 'Yamaha']);
    expect(facets.cities.map((c) => c.toLowerCase()).sort()).toEqual(['casablanca', 'rabat']);
    expect(facets.maxMileage).toBe(55000);
    expect(facets.maxCc).toBe(500);
    expect(facets.maxPrice).toBe(70000);
    expect(facets.fuels).toEqual([]);
    expect(facets.gearboxes).toEqual([]);
  });
});

describe('vehicle type isolation', () => {
  it('does not mix car listings into the motorcycle feed', async () => {
    const db = await openDatabase({ url: ':memory:' });
    try {
      const models = new LibsqlModelRepository(db);
      await models.upsert(storedModel({ id: 'yamaha-mt07', brand: 'Yamaha', model: 'MT-07' }));
      await models.upsert(
        storedModel({
          id: 'dacia-duster',
          brand: 'Dacia',
          model: 'Duster',
          vehicleType: 'car',
          maxMileageKm: 150000,
        }),
      );
      const repo = new LibsqlListingRepository(db, await models.listAll());
      await repo.save(scored({ externalId: 'bike-1' }));
      await repo.save({
        listing: makeListing({
          externalId: 'car-1',
          sourceId: 'avito-cars',
          vehicleType: 'car',
          title: 'Dacia Duster 2019',
          priceMAD: 150000,
        }),
        match: {
          criteria: makeModelCriteria({
            id: 'dacia-duster',
            brand: 'Dacia',
            model: 'Duster',
            vehicleType: 'car',
          }),
          confidence: 0.9,
        },
        score: { price: 0, mileage: 0, year: 0, city: 0, total: 75, reasons: [] },
        isGoodDeal: true,
      });

      const moto = await repo.queryDeals(query({ vehicleType: 'motorcycle' }));
      expect(moto.deals.map((d) => d.listing.externalId)).toEqual(['bike-1']);

      const cars = await repo.queryDeals(query({ vehicleType: 'car' }));
      expect(cars.deals.map((d) => d.listing.externalId)).toEqual(['car-1']);
    } finally {
      db.close();
    }
  });
});
