import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { DealScanner } from '../../src/application/services/DealScanner.js';
import type { Listing, MarketplaceId } from '../../src/domain/entities/Listing.js';
import type { ScoredListing } from '../../src/domain/entities/ScoredListing.js';
import type { SearchCriteria } from '../../src/domain/entities/SearchCriteria.js';
import type { ListingRepository } from '../../src/domain/interfaces/ListingRepository.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../src/domain/interfaces/MarketplaceSource.js';
import { makeGlobalCriteria, makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

const silentLogger = pino({ level: 'silent' });

class FakeSource implements MarketplaceSource {
  readonly disposeCalls: number[] = [];
  private callCount = 0;

  constructor(
    readonly id: MarketplaceId,
    readonly name: string,
    private readonly listingsByCall: Listing[][],
  ) {}

  fetchListings(_query: SourceQuery): Promise<Listing[]> {
    const result = this.listingsByCall[this.callCount] ?? [];
    this.callCount += 1;
    return Promise.resolve(result);
  }

  dispose(): Promise<void> {
    this.disposeCalls.push(1);
    return Promise.resolve();
  }
}

class InMemoryRepository implements ListingRepository {
  readonly saved: ScoredListing[] = [];
  private readonly seen = new Set<string>();

  hasSeen(sourceId: MarketplaceId, externalId: string): Promise<boolean> {
    return Promise.resolve(this.seen.has(`${sourceId}:${externalId}`));
  }

  save(scored: ScoredListing): Promise<void> {
    this.seen.add(`${scored.listing.sourceId}:${scored.listing.externalId}`);
    this.saved.push(scored);
    return Promise.resolve();
  }

  getGoodDealsSince(): Promise<ScoredListing[]> {
    return Promise.resolve(this.saved.filter((s) => s.isGoodDeal));
  }

  getRecentGoodDeals(limit: number): Promise<ScoredListing[]> {
    return Promise.resolve(this.saved.filter((s) => s.isGoodDeal).slice(0, limit));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function buildCriteria(overrides: Partial<SearchCriteria['global']> = {}): SearchCriteria {
  return {
    models: [makeModelCriteria()],
    global: makeGlobalCriteria(overrides),
  };
}

describe('DealScanner', () => {
  let repository: InMemoryRepository;

  beforeEach(() => {
    repository = new InMemoryRepository();
  });

  it('scores and saves a new listing that clears the good-deal bar', async () => {
    const criteria = buildCriteria();
    const goodListing = makeListing({
      externalId: '1',
      priceMAD: 60000,
      mileageKm: 1000,
      year: 2023,
    });
    const source = new FakeSource('avito', 'Avito.ma', [[goodListing]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(1);
    expect(report.goodDeals).toHaveLength(1);
    expect(report.goodDeals[0]?.listing.externalId).toBe('1');
    expect(repository.saved).toHaveLength(1);
  });

  it('skips listings already seen', async () => {
    const criteria = buildCriteria();
    const listing = makeListing({ externalId: '1' });
    const source = new FakeSource('avito', 'Avito.ma', [[listing]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });
    await repository.save({
      listing,
      match: { criteria: criteria.models[0]!, confidence: 1 },
      score: { price: 0, mileage: 0, year: 0, city: 0, total: 0, reasons: [] },
      isGoodDeal: false,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(0);
  });

  it('drops listings whose title does not plausibly match the wanted model', async () => {
    const criteria = buildCriteria({ minModelMatchConfidence: 0.55 });
    const unrelated = makeListing({ externalId: '2', title: 'Scooter chinois 50cc pas cher' });
    const source = new FakeSource('avito', 'Avito.ma', [[unrelated]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(0);
  });

  it('excludes listings from cities outside the acceptable list', async () => {
    const criteria = buildCriteria({ acceptableCities: ['Casablanca'] });
    const listing = makeListing({ externalId: '3', city: 'Tanger' });
    const source = new FakeSource('avito', 'Avito.ma', [[listing]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(0);
  });

  it('excludes listings priced outside the search budget range', async () => {
    const criteria = buildCriteria({
      searchRange: { budgetMin: 60000, budgetMax: 90000, yearMin: 2010, yearMax: 2030 },
    });
    const tooExpensive = makeListing({ externalId: 'p1', priceMAD: 120000 });
    const tooCheap = makeListing({ externalId: 'p2', priceMAD: 40000 });
    const inRange = makeListing({ externalId: 'p3', priceMAD: 75000 });
    const source = new FakeSource('avito', 'Avito.ma', [[tooExpensive, tooCheap, inRange]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(1);
    expect(report.sources[0]?.newListings).toBe(1);
  });

  it('drops implausibly cheap listings (typos/deposits) below the price floor', async () => {
    // Model fair min is 65000; with minPriceFactor 0.5 the floor is 32500.
    const criteria = buildCriteria({ minPriceFactor: 0.5 });
    const typo = makeListing({ externalId: 'c1', priceMAD: 8000 });
    const deposit = makeListing({ externalId: 'c2', priceMAD: 20000 });
    const realDeal = makeListing({ externalId: 'c3', priceMAD: 60000 });
    const source = new FakeSource('avito', 'Avito.ma', [[typo, deposit, realDeal]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(1);
    expect(repository.saved.map((s) => s.listing.externalId)).toEqual(['c3']);
  });

  it('keeps implausibly cheap listings when the price floor is disabled (factor 0)', async () => {
    const criteria = buildCriteria({ minPriceFactor: 0 });
    const cheap = makeListing({ externalId: 'z1', priceMAD: 8000 });
    const source = new FakeSource('avito', 'Avito.ma', [[cheap]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(1);
  });

  it('excludes listings with a model year outside the search year range', async () => {
    const criteria = buildCriteria({
      searchRange: { budgetMin: 0, budgetMax: 500000, yearMin: 2019, yearMax: 2024 },
    });
    const tooOld = makeListing({ externalId: 'y1', year: 2016 });
    const inRange = makeListing({ externalId: 'y2', year: 2021 });
    const unknownYear = makeListing({ externalId: 'y3', year: undefined });
    const source = new FakeSource('avito', 'Avito.ma', [[tooOld, inRange, unknownYear]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    // In-range plus the unknown-year listing (which can't be judged) are kept; the 2016 is dropped.
    expect(report.newListingsSeen).toBe(2);
  });

  it('excludes listings older than maxListingAgeDays', async () => {
    const criteria = buildCriteria({ maxListingAgeDays: 7 });
    const stale = makeListing({
      externalId: '4',
      postedAt: new Date(Date.now() - 30 * 86_400_000),
    });
    const source = new FakeSource('avito', 'Avito.ma', [[stale]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(0);
  });

  it('keeps listings with unknown postedAt regardless of maxListingAgeDays', async () => {
    const criteria = buildCriteria({ maxListingAgeDays: 7 });
    const listing = makeListing({ externalId: '5', postedAt: undefined });
    const source = new FakeSource('avito', 'Avito.ma', [[listing]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    expect(report.newListingsSeen).toBe(1);
  });

  it('records a per-source error and still returns results from other sources', async () => {
    const criteria = buildCriteria();
    const failingSource: MarketplaceSource = {
      id: 'biker',
      name: 'Biker.ma',
      fetchListings: () => Promise.reject(new Error('boom')),
      dispose: () => Promise.resolve(),
    };
    const workingListing = makeListing({ externalId: '6', sourceId: 'avito' });
    const workingSource = new FakeSource('avito', 'Avito.ma', [[workingListing]]);
    const scanner = new DealScanner({
      sources: [failingSource, workingSource],
      repository,
      criteria,
      logger: silentLogger,
    });

    const report = await scanner.scan();

    const bikerSummary = report.sources.find((s) => s.sourceId === 'biker');
    expect(bikerSummary?.error).toContain('boom');
    expect(report.newListingsSeen).toBe(1);
  });

  it('disposeSources disposes every source', async () => {
    const criteria = buildCriteria();
    const source = new FakeSource('avito', 'Avito.ma', [[]]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    await scanner.disposeSources();

    expect(source.disposeCalls).toHaveLength(1);
  });
});
