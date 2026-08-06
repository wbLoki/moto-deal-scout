import type { Logger } from 'pino';
import type {
  DailyReport,
  PriceDrop,
  SourceRunSummary,
} from '../../domain/entities/DailyReport.js';
import type { Listing } from '../../domain/entities/Listing.js';
import type { ScoredListing } from '../../domain/entities/ScoredListing.js';
import type { ModelCriteria, SearchCriteria } from '../../domain/entities/SearchCriteria.js';
import type { StoredModel } from '../../domain/entities/Model.js';
import type { ListingRepository } from '../../domain/interfaces/ListingRepository.js';
import type {
  MarketplaceSource,
  SourceQuery,
} from '../../domain/interfaces/MarketplaceSource.js';
import { provisionalModel } from '../../domain/services/provisionalModel.js';
import type { CatalogModelResolver } from './CatalogModelResolver.js';
import { MIN_DISCOVERY_CONFIDENCE } from './CatalogModelResolver.js';
import { listingWithinRange } from '../../domain/services/rangeFilter.js';
import { priceIsPlausible } from '../../domain/services/priceFilter.js';
import { isCalibrated } from '../../domain/services/calibrationState.js';
import { FuzzyModelMatcher } from './FuzzyModelMatcher.js';
import { ListingScorer } from './ListingScorer.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DealScannerDeps {
  readonly sources: readonly MarketplaceSource[];
  readonly repository: ListingRepository;
  readonly criteria: SearchCriteria;
  readonly logger: Logger;
  readonly matcher?: FuzzyModelMatcher;
  readonly scorer?: ListingScorer;
  /** Resolves a raw listing title to a catalog model. Required by {@link DealScanner.discover}. */
  readonly resolver?: CatalogModelResolver;
  /**
   * Persists a model the crawl just discovered. Must not overwrite an
   * existing row (see `ModelRepository.insertIfAbsent`) — resetting a
   * calibrated price range on every weekly crawl would undo all calibration.
   * Returns true when the model was newly created.
   */
  readonly modelSink?: (model: StoredModel) => Promise<boolean>;
  /** How deep the discovery crawl paginates. Ignored by {@link DealScanner.scan}. */
  readonly discoveryMaxPages?: number;
}

/**
 * Orchestrates one full scan: for every wanted model, query every
 * marketplace source, drop listings we've already seen or that don't
 * plausibly match, score the rest, and persist everything so tomorrow's
 * run only reports what's new.
 */
export class DealScanner {
  private readonly sources: readonly MarketplaceSource[];
  private readonly repository: ListingRepository;
  private readonly criteria: SearchCriteria;
  private readonly logger: Logger;
  private readonly matcher: FuzzyModelMatcher;
  private readonly scorer: ListingScorer;
  private readonly resolver: CatalogModelResolver | undefined;
  private readonly modelSink: ((model: StoredModel) => Promise<boolean>) | undefined;
  private readonly discoveryMaxPages: number | undefined;

  constructor(deps: DealScannerDeps) {
    this.sources = deps.sources;
    this.repository = deps.repository;
    this.criteria = deps.criteria;
    this.logger = deps.logger;
    this.matcher = deps.matcher ?? new FuzzyModelMatcher(deps.criteria.models);
    this.scorer = deps.scorer ?? new ListingScorer();
    this.resolver = deps.resolver;
    this.modelSink = deps.modelSink;
    this.discoveryMaxPages = deps.discoveryMaxPages;
  }

  /** Price drops found on already-seen listings during the current scan. */
  private priceDrops: PriceDrop[] = [];

  async scan(): Promise<DailyReport> {
    const sourceSummaries: SourceRunSummary[] = [];
    const newlyScored: ScoredListing[] = [];
    this.priceDrops = [];
    let totalScanned = 0;

    for (const source of this.sources) {
      const { summary, scored, scanned } = await this.scanSource(source);
      sourceSummaries.push(summary);
      newlyScored.push(...scored);
      totalScanned += scanned;
    }

    const goodDeals = newlyScored.filter((s) => s.isGoodDeal);
    this.logger.info(
      {
        totalScanned,
        newListings: newlyScored.length,
        goodDeals: goodDeals.length,
        priceDrops: this.priceDrops.length,
      },
      'scan complete',
    );

    return {
      runAt: new Date(),
      sources: sourceSummaries,
      totalListingsScanned: totalScanned,
      newListingsSeen: newlyScored.length,
      goodDeals,
      priceDrops: this.priceDrops,
    };
  }

  /**
   * One discovery crawl: browse each marketplace's whole motorcycle category
   * (no per-model search), resolve every title against the reference catalog,
   * create any model we haven't seen before, then run the listing through the
   * exact same pipeline `scan()` uses — age/city filters, already-seen
   * dedupe, price-drop detection, scoring and persistence.
   *
   * Titles that don't resolve are skipped by design: discovery is restricted
   * to the catalog so the long tail can't fill the model list with junk.
   */
  async discover(): Promise<DailyReport> {
    const { resolver, modelSink } = this;
    if (!resolver || !modelSink) {
      throw new Error('discover() needs both a resolver and a modelSink');
    }

    const sourceSummaries: SourceRunSummary[] = [];
    const newlyScored: ScoredListing[] = [];
    this.priceDrops = [];
    let totalScanned = 0;
    let unmatched = 0;
    const discovered = new Set<string>();
    // Models resolved during this run, so a second listing for the same model
    // reuses the criteria we already built rather than re-creating it.
    const known = new Map<string, ModelCriteria>(this.criteria.models.map((m) => [m.id, m]));

    for (const source of this.sources) {
      let listingsFound = 0;
      let error: string | undefined;
      const scored: ScoredListing[] = [];

      try {
        const query: SourceQuery =
          this.discoveryMaxPages === undefined ? {} : { maxPages: this.discoveryMaxPages };
        const listings = await source.fetchListings(query);
        listingsFound = listings.length;

        for (const listing of listings) {
          const match = resolver.resolve(listing.title);
          if (!match || match.confidence < MIN_DISCOVERY_CONFIDENCE) {
            unmatched += 1;
            continue;
          }

          let criteria = known.get(match.id);
          if (!criteria) {
            const model = provisionalModel(match);
            if (await modelSink(model)) discovered.add(match.id);
            criteria = model;
            known.set(match.id, criteria);
          }

          const result = await this.processListing(listing, criteria, match.confidence);
          if (result) scored.push(result);
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        this.logger.error({ err, source: source.id }, 'discovery crawl failed');
      }

      sourceSummaries.push({
        sourceId: source.id,
        listingsFound,
        newListings: scored.length,
        error,
      });
      newlyScored.push(...scored);
      totalScanned += listingsFound;
    }

    const goodDeals = newlyScored.filter((s) => s.isGoodDeal);
    this.logger.info(
      {
        totalScanned,
        newListings: newlyScored.length,
        modelsDiscovered: discovered.size,
        unmatchedTitles: unmatched,
        goodDeals: goodDeals.length,
        priceDrops: this.priceDrops.length,
      },
      'discovery complete',
    );

    return {
      runAt: new Date(),
      sources: sourceSummaries,
      totalListingsScanned: totalScanned,
      newListingsSeen: newlyScored.length,
      goodDeals,
      priceDrops: this.priceDrops,
    };
  }

  /** Disposes every source's underlying browser/context. Call after scan() in a finally block. */
  async disposeSources(): Promise<void> {
    await Promise.all(this.sources.map((s) => s.dispose()));
  }

  private async scanSource(
    source: MarketplaceSource,
  ): Promise<{ summary: SourceRunSummary; scored: ScoredListing[]; scanned: number }> {
    let listingsFound = 0;
    let error: string | undefined;
    const scored: ScoredListing[] = [];

    try {
      for (const model of this.criteria.models) {
        const listings = await source.fetchListings({ criteria: model });
        listingsFound += listings.length;

        for (const listing of listings) {
          const result = await this.processListing(listing, model);
          if (result) scored.push(result);
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, source: source.id }, 'marketplace source failed');
    }

    return {
      summary: { sourceId: source.id, listingsFound, newListings: scored.length, error },
      scored,
      scanned: listingsFound,
    };
  }

  private async processListing(
    listing: Listing,
    model: SearchCriteria['models'][number],
    /** Supplied by discovery, which already established the match itself. */
    knownConfidence?: number,
  ): Promise<ScoredListing | undefined> {
    if (!this.isWithinAcceptableAge(listing)) return undefined;
    if (!this.isAcceptableCity(listing.city)) return undefined;
    if (!this.isWithinSearchRange(listing)) return undefined;
    if (!this.isPlausiblePrice(listing, model)) return undefined;

    const alreadySeen = await this.repository.hasSeen(listing.sourceId, listing.externalId);
    if (alreadySeen) {
      await this.checkPriceDrop(listing, model);
      return undefined;
    }

    const confidence = knownConfidence ?? this.matcher.matchAgainst(listing.title, model);
    if (confidence < this.criteria.global.minModelMatchConfidence) return undefined;

    const score = this.scorer.score(listing, model, this.criteria.global);
    const result: ScoredListing = {
      listing,
      match: { criteria: model, confidence },
      score,
      // An uncalibrated model can't be judged a good deal — its price factor
      // is a placeholder. Keeping this false is what stops alert emails going
      // out for listings the dashboard is still showing as "Calibrating".
      isGoodDeal:
        isCalibrated(model) && score.total >= this.criteria.global.minScoreForGoodDeal,
    };

    await this.repository.save(result);
    return result;
  }

  /**
   * For a listing we've already stored, note it if the seller lowered the
   * price: update the stored row and record a PriceDrop for alerting. Only
   * drops (new < old) are recorded; re-listings at the same or higher price
   * are ignored.
   */
  private async checkPriceDrop(
    listing: Listing,
    model: SearchCriteria['models'][number],
  ): Promise<void> {
    const stored = await this.repository.getStoredPrice(listing.sourceId, listing.externalId);
    if (stored === undefined || listing.priceMAD >= stored) return;

    await this.repository.recordPriceDrop(
      listing.sourceId,
      listing.externalId,
      listing.priceMAD,
      stored,
    );
    this.priceDrops.push({
      listing,
      model,
      oldPriceMAD: stored,
      newPriceMAD: listing.priceMAD,
    });
  }

  private isWithinAcceptableAge(listing: Listing): boolean {
    if (!listing.postedAt) return true;
    const ageDays = (Date.now() - listing.postedAt.getTime()) / MS_PER_DAY;
    return ageDays <= this.criteria.global.maxListingAgeDays;
  }

  private isAcceptableCity(city: string): boolean {
    const { acceptableCities } = this.criteria.global;
    if (acceptableCities.length === 0) return true;
    const normalized = city.trim().toLowerCase();
    return acceptableCities.some((c) => c.trim().toLowerCase() === normalized);
  }

  /**
   * Optional global hard budget/year window (admin config). In the
   * multi-user setup the per-user range is applied as a view filter on the
   * dashboard instead, so this is usually unset and the scan stores every
   * matching listing.
   */
  private isWithinSearchRange(listing: Listing): boolean {
    const range = this.criteria.global.searchRange;
    return range ? listingWithinRange(listing, range) : true;
  }

  /**
   * Drops listings priced implausibly far below the model's fair value —
   * almost always a typo, a deposit/"avance", or a scam (e.g. an MT-07 for
   * 8 000 MAD) — so they never become fake "good deals".
   */
  private isPlausiblePrice(listing: Listing, model: SearchCriteria['models'][number]): boolean {
    return priceIsPlausible(
      listing.priceMAD,
      model.priceRangeMAD.min,
      this.criteria.global.minPriceFactor,
    );
  }
}
