import type { Logger } from 'pino';
import type { DailyReport, SourceRunSummary } from '../../domain/entities/DailyReport.js';
import type { Listing } from '../../domain/entities/Listing.js';
import type { ScoredListing } from '../../domain/entities/ScoredListing.js';
import type { SearchCriteria } from '../../domain/entities/SearchCriteria.js';
import type { ListingRepository } from '../../domain/interfaces/ListingRepository.js';
import type { MarketplaceSource } from '../../domain/interfaces/MarketplaceSource.js';
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

  constructor(deps: DealScannerDeps) {
    this.sources = deps.sources;
    this.repository = deps.repository;
    this.criteria = deps.criteria;
    this.logger = deps.logger;
    this.matcher = deps.matcher ?? new FuzzyModelMatcher(deps.criteria.models);
    this.scorer = deps.scorer ?? new ListingScorer();
  }

  async scan(): Promise<DailyReport> {
    const sourceSummaries: SourceRunSummary[] = [];
    const newlyScored: ScoredListing[] = [];
    let totalScanned = 0;

    for (const source of this.sources) {
      const { summary, scored, scanned } = await this.scanSource(source);
      sourceSummaries.push(summary);
      newlyScored.push(...scored);
      totalScanned += scanned;
    }

    const goodDeals = newlyScored.filter((s) => s.isGoodDeal);
    this.logger.info(
      { totalScanned, newListings: newlyScored.length, goodDeals: goodDeals.length },
      'scan complete',
    );

    return {
      runAt: new Date(),
      sources: sourceSummaries,
      totalListingsScanned: totalScanned,
      newListingsSeen: newlyScored.length,
      goodDeals,
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
  ): Promise<ScoredListing | undefined> {
    if (!this.isWithinAcceptableAge(listing)) return undefined;
    if (!this.isAcceptableCity(listing.city)) return undefined;

    const alreadySeen = await this.repository.hasSeen(listing.sourceId, listing.externalId);
    if (alreadySeen) return undefined;

    const confidence = this.matcher.matchAgainst(listing.title, model);
    if (confidence < this.criteria.global.minModelMatchConfidence) return undefined;

    const score = this.scorer.score(listing, model, this.criteria.global);
    const result: ScoredListing = {
      listing,
      match: { criteria: model, confidence },
      score,
      isGoodDeal: score.total >= this.criteria.global.minScoreForGoodDeal,
    };

    await this.repository.save(result);
    return result;
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
}
