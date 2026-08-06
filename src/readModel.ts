import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchCriteria, SearchRange } from './domain/entities/SearchCriteria.js';
import { listingWithinRange } from './domain/services/rangeFilter.js';
import { priceIsPlausible } from './domain/services/priceFilter.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlSavedListingRepository } from './infrastructure/persistence/libsql/LibsqlSavedListingRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';

export interface DashboardData {
  readonly criteria: SearchCriteria;
  readonly onboarded: boolean;
  /** All listings within the user's range, best deal first. */
  readonly allDeals: readonly ScoredListing[];
  /** Range-filtered listings first found today, best deal first. */
  readonly dailyDeals: readonly ScoredListing[];
  readonly watchedModelIds: readonly string[];
  /** The user's bookmarked listings as full deals, most recently saved first. */
  readonly savedDeals: readonly ScoredListing[];
  readonly searchRange: SearchRange;
  /** Listings stored before the user's range filter was applied. */
  readonly totalBeforeFilter: number;
}

// The scan stores more listings than we show; fetch a generous page, filter
// by the user's range, sort best-first, then cap at `limit`.
const FETCH_MULTIPLIER = 5;

function byScoreDesc(a: ScoredListing, b: ScoredListing): number {
  return b.score.total - a.score.total;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Per-user dashboard read. Opens the database once and returns everything the
 * dashboard needs: onboarding state, the user's followed models and range,
 * and the recent good deals grouped into all / today / watched — each already
 * filtered to the user's budget/year range.
 */
export async function getDashboardData(userId: string, limit = 60): Promise<DashboardData> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.seedIfEmpty(config.models);
    const allModels = await modelRepo.listAll();
    const enabledModels = await modelRepo.listEnabledCriteria();

    const profileRepo = new LibsqlUserProfileRepository(db);
    const [onboarded, watchedModelIds] = await Promise.all([
      profileRepo.isOnboarded(userId),
      profileRepo.getWatchedModelIds(userId),
    ]);

    const listings = new LibsqlListingRepository(db, allModels);
    const storedRange = await new LibsqlUserSearchRangeRepository(db).get(userId);
    const searchRange = storedRange ?? DEFAULT_SEARCH_RANGE;

    // Hide implausibly-cheap listings (typos/deposits) that may have been
    // stored before the scan-time price floor existed.
    const plausible = (d: ScoredListing): boolean =>
      priceIsPlausible(
        d.listing.priceMAD,
        d.match.criteria.priceRangeMAD.min,
        config.global.minPriceFactor,
      );

    const recent = (await listings.getRecentListings(limit * FETCH_MULTIPLIER)).filter(plausible);
    const recentInRange = recent
      .filter((d) => listingWithinRange(d.listing, searchRange))
      .sort(byScoreDesc);

    const today = (await listings.getListingsSince(startOfToday())).filter(plausible);
    const todayInRange = today
      .filter((d) => listingWithinRange(d.listing, searchRange))
      .sort(byScoreDesc);

    // Saved deals are shown regardless of the user's range (they chose them).
    const savedDeals = (
      await new LibsqlSavedListingRepository(db, allModels).listSavedDeals(userId)
    ).filter(plausible);

    return {
      criteria: { models: enabledModels, global: config.global },
      onboarded,
      allDeals: recentInRange.slice(0, limit),
      dailyDeals: todayInRange.slice(0, limit),
      watchedModelIds,
      savedDeals,
      searchRange,
      totalBeforeFilter: recent.length,
    };
  } finally {
    db.close();
  }
}

/**
 * Public, no-login read: the top-scored recent listings across all models,
 * with no per-user range filter — just plausibly priced and sorted best-first.
 * Shared by the public homepage feed (`getPublicDeals`) and the smaller landing
 * teaser (`getHotDeals`); the only difference is how many deals are returned.
 */
async function readPublicDeals(limit: number): Promise<ScoredListing[]> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.seedIfEmpty(config.models);
    const allModels = await modelRepo.listAll();

    const listings = new LibsqlListingRepository(db, allModels);
    const recent = await listings.getRecentListings(limit * FETCH_MULTIPLIER);
    return recent
      .filter((d) =>
        priceIsPlausible(
          d.listing.priceMAD,
          d.match.criteria.priceRangeMAD.min,
          config.global.minPriceFactor,
        ),
      )
      .sort(byScoreDesc)
      .slice(0, limit);
  } finally {
    db.close();
  }
}

/**
 * The full public deal feed shown to anonymous visitors on the homepage. Same
 * shape and scoring as the member feed, minus the per-user budget/year filter.
 */
export function getPublicDeals(limit = 60): Promise<ScoredListing[]> {
  return readPublicDeals(limit);
}

/** A small teaser of the globally hottest deals (e.g. for marketing sections). */
export function getHotDeals(limit = 6): Promise<ScoredListing[]> {
  return readPublicDeals(limit);
}
