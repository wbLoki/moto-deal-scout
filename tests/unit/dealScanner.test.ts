import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DealScanner } from '../../src/application/services/DealScanner.js';
import { CatalogModelResolver } from '../../src/application/services/CatalogModelResolver.js';
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
  /** Listings passed to enrich(), so tests can assert it ran only for new ones. */
  readonly enrichCalls: Listing[] = [];
  private callCount = 0;

  constructor(
    readonly id: MarketplaceId,
    readonly name: string,
    private readonly listingsByCall: Listing[][],
    /** When set, enrich() applies it (e.g. stamp postedAt); otherwise passthrough. */
    private readonly enrichFn?: (listing: Listing) => Listing,
  ) {}

  fetchListings(_query: SourceQuery): Promise<Listing[]> {
    const result = this.listingsByCall[this.callCount] ?? [];
    this.callCount += 1;
    return Promise.resolve(result);
  }

  enrich(listing: Listing): Promise<Listing> {
    this.enrichCalls.push(listing);
    return Promise.resolve(this.enrichFn ? this.enrichFn(listing) : listing);
  }

  dispose(): Promise<void> {
    this.disposeCalls.push(1);
    return Promise.resolve();
  }
}

class InMemoryRepository implements ListingRepository {
  readonly saved: ScoredListing[] = [];
  private readonly seen = new Set<string>();
  private readonly prices = new Map<string, number>();

  readonly crawled = new Set<string>();

  hasSeen(sourceId: MarketplaceId, externalId: string): Promise<boolean> {
    return Promise.resolve(this.seen.has(`${sourceId}:${externalId}`));
  }

  crawledExternalIds(sourceId: MarketplaceId): Promise<Set<string>> {
    const ids = [...this.crawled]
      .filter((k) => k.startsWith(`${sourceId}:`))
      .map((k) => k.slice(sourceId.length + 1));
    return Promise.resolve(new Set(ids));
  }

  recordCrawled(sourceId: MarketplaceId, externalIds: readonly string[]): Promise<void> {
    for (const id of externalIds) this.crawled.add(`${sourceId}:${id}`);
    return Promise.resolve();
  }

  lastScrapedAt(sourceId: MarketplaceId): Promise<Date | undefined> {
    const times = this.saved
      .filter((s) => s.listing.sourceId === sourceId)
      .map((s) => s.listing.scrapedAt.getTime());
    return Promise.resolve(times.length ? new Date(Math.max(...times)) : undefined);
  }

  save(scored: ScoredListing): Promise<void> {
    const key = `${scored.listing.sourceId}:${scored.listing.externalId}`;
    this.seen.add(key);
    this.prices.set(key, scored.listing.priceMAD);
    this.saved.push(scored);
    return Promise.resolve();
  }

  getStoredPrice(sourceId: MarketplaceId, externalId: string): Promise<number | undefined> {
    return Promise.resolve(this.prices.get(`${sourceId}:${externalId}`));
  }

  findBySourceExternalId(
    sourceId: MarketplaceId,
    externalId: string,
  ): Promise<ScoredListing | undefined> {
    return Promise.resolve(
      this.saved.find(
        (s) => s.listing.sourceId === sourceId && s.listing.externalId === externalId,
      ),
    );
  }

  recordPriceDrop(sourceId: MarketplaceId, externalId: string, newPriceMAD: number): Promise<void> {
    this.prices.set(`${sourceId}:${externalId}`, newPriceMAD);
    return Promise.resolve();
  }

  refreshMissingImage(
    sourceId: MarketplaceId,
    externalId: string,
    imageUrl: string,
  ): Promise<void> {
    const idx = this.saved.findIndex(
      (s) => s.listing.sourceId === sourceId && s.listing.externalId === externalId,
    );
    if (idx < 0) return Promise.resolve();
    const current = this.saved[idx]!;
    const existing = current.listing.imageUrl;
    if (existing && !/phoenix-assets|avatar\.svg/i.test(existing)) return Promise.resolve();
    this.saved[idx] = {
      ...current,
      listing: { ...current.listing, imageUrl },
    };
    return Promise.resolve();
  }

  listImageGaps(
    sourceId: MarketplaceId,
  ): Promise<readonly { readonly externalId: string; readonly url: string }[]> {
    return Promise.resolve(
      this.saved
        .filter(
          (s) =>
            s.listing.sourceId === sourceId &&
            (!s.listing.imageUrl || /phoenix-assets|avatar\.svg/i.test(s.listing.imageUrl)),
        )
        .map((s) => ({ externalId: s.listing.externalId, url: s.listing.url })),
    );
  }

  getGoodDealsSince(): Promise<ScoredListing[]> {
    return Promise.resolve(this.saved.filter((s) => s.isGoodDeal));
  }

  getRecentGoodDeals(limit: number): Promise<ScoredListing[]> {
    return Promise.resolve(this.saved.filter((s) => s.isGoodDeal).slice(0, limit));
  }

  getRecentListings(limit: number): Promise<ScoredListing[]> {
    return Promise.resolve(this.saved.slice(0, limit));
  }

  getTopScoredListings(limit: number): Promise<ScoredListing[]> {
    return Promise.resolve(
      [...this.saved].sort((a, b) => b.score.total - a.score.total).slice(0, limit),
    );
  }

  getListingsSince(): Promise<ScoredListing[]> {
    return Promise.resolve(this.saved);
  }

  // Dashboard-only reads; the scanner never calls these, so stubs suffice.
  queryDeals(): Promise<{ deals: ScoredListing[]; total: number }> {
    return Promise.resolve({ deals: [], total: 0 });
  }

  countDealsByTab(): Promise<{ all: number; daily: number; watched: number; saved: number }> {
    return Promise.resolve({ all: 0, daily: 0, watched: 0, saved: 0 });
  }

  getDealFacets(): Promise<{
    brands: string[];
    cities: string[];
    maxMileage: number;
    maxCc: number;
    maxPrice: number;
  }> {
    return Promise.resolve({ brands: [], cities: [], maxMileage: 0, maxCc: 0, maxPrice: 0 });
  }

  getPricesForModel(modelId: string): Promise<number[]> {
    return Promise.resolve(
      this.saved.filter((s) => s.match.criteria.id === modelId).map((s) => s.listing.priceMAD),
    );
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

  it('enriches a new listing (e.g. fetches its post date) before storing it', async () => {
    const criteria = buildCriteria();
    const posted = new Date('2025-03-17T00:00:00Z');
    const listing = makeListing({ externalId: '1', priceMAD: 60000, mileageKm: 1000, year: 2023 });
    const source = new FakeSource('biker', 'Biker.ma', [[listing]], (l) => ({
      ...l,
      postedAt: posted,
    }));
    const scanner = new DealScanner({ sources: [source], repository, criteria, logger: silentLogger });

    await scanner.scan();

    expect(source.enrichCalls).toHaveLength(1);
    expect(repository.saved[0]?.listing.postedAt).toEqual(posted);
  });

  it('does not enrich a listing it has already stored', async () => {
    const criteria = buildCriteria();
    const listing = makeListing({ externalId: '1' });
    const source = new FakeSource('biker', 'Biker.ma', [[listing]]);
    const scanner = new DealScanner({ sources: [source], repository, criteria, logger: silentLogger });
    await repository.save({
      listing,
      match: { criteria: criteria.models[0]!, confidence: 1 },
      score: { price: 0, mileage: 0, year: 0, city: 0, total: 0, reasons: [] },
      isGoodDeal: false,
    });

    await scanner.scan();

    // The extra detail-page fetch must be skipped for listings we already have.
    expect(source.enrichCalls).toHaveLength(0);
  });

  it('records a price drop when an already-seen listing gets cheaper', async () => {
    const criteria = buildCriteria();
    const source = new FakeSource('avito', 'Avito.ma', [
      [makeListing({ externalId: '1', priceMAD: 70000 })],
      [makeListing({ externalId: '1', priceMAD: 62000 })],
    ]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    const first = await scanner.scan();
    expect(first.priceDrops).toHaveLength(0);

    const second = await scanner.scan();
    expect(second.newListingsSeen).toBe(0);
    expect(second.priceDrops).toHaveLength(1);
    expect(second.priceDrops[0]).toMatchObject({ oldPriceMAD: 70000, newPriceMAD: 62000 });
    expect(await repository.getStoredPrice('avito', '1')).toBe(62000);
  });

  it('backfills a missing image on an already-seen listing', async () => {
    const criteria = buildCriteria();
    const source = new FakeSource('avito', 'Avito.ma', [
      [makeListing({ externalId: '1', imageUrl: undefined })],
      [
        makeListing({
          externalId: '1',
          imageUrl: 'https://content.avito.ma/classifieds/images/99?t=images',
        }),
      ],
    ]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    await scanner.scan();
    expect(repository.saved[0]?.listing.imageUrl).toBeUndefined();

    await scanner.scan();
    expect(repository.saved[0]?.listing.imageUrl).toBe(
      'https://content.avito.ma/classifieds/images/99?t=images',
    );
  });

  it('backfills images even when the re-crawled card would be filtered', async () => {
    const criteria = buildCriteria();
    await repository.save({
      listing: makeListing({ externalId: '1', imageUrl: undefined }),
      match: { criteria: criteria.models[0]!, confidence: 1 },
      score: { price: 0, mileage: 0, year: 0, city: 0, total: 0, reasons: [] },
      isGoodDeal: false,
    });
    const source = new FakeSource('avito', 'Avito.ma', [
      [
        makeListing({
          externalId: '1',
          title: 'Scooter chinois 50cc pas cher',
          imageUrl: 'https://content.avito.ma/classifieds/images/99?t=images',
        }),
      ],
    ]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    await scanner.scan();
    expect(repository.saved[0]?.listing.imageUrl).toBe(
      'https://content.avito.ma/classifieds/images/99?t=images',
    );
  });

  it('does not record a price drop when the price is unchanged or higher', async () => {
    const criteria = buildCriteria();
    const source = new FakeSource('avito', 'Avito.ma', [
      [makeListing({ externalId: '1', priceMAD: 70000 })],
      [makeListing({ externalId: '1', priceMAD: 75000 })],
    ]);
    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
    });

    await scanner.scan();
    const second = await scanner.scan();

    expect(second.priceDrops).toHaveLength(0);
    expect(await repository.getStoredPrice('avito', '1')).toBe(70000);
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

  it('sends a known-brand, unknown-model listing to the review queue during discovery', async () => {
    const criteria = buildCriteria();
    // Names a maker we know (Yamaha) but a model that isn't in the catalog.
    const unknownModel = makeListing({ externalId: 'r1', title: 'Yamaha Zwergpiraten 9000 2021' });
    // A pure scooter/rental with no known brand must NOT be queued.
    const junk = makeListing({ externalId: 'r2', title: 'Location scooter Tanger prix bas' });
    const source = new FakeSource('biker', 'Biker.ma', [[unknownModel, junk]]);
    const reviewSink = vi.fn<(listing: Listing, brand: string) => Promise<void>>().mockResolvedValue();

    const scanner = new DealScanner({
      sources: [source],
      repository,
      criteria,
      logger: silentLogger,
      resolver: new CatalogModelResolver(),
      modelSink: () => Promise.resolve(true),
      reviewSink,
    });

    await scanner.discover();

    expect(reviewSink).toHaveBeenCalledTimes(1);
    expect(reviewSink).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'r1' }),
      'Yamaha',
    );
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
