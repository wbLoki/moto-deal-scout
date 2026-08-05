import type { Client } from '@libsql/client';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { DailyReport } from './domain/entities/DailyReport.js';
import type { NewNotification } from './domain/entities/Notification.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchRange } from './domain/entities/SearchCriteria.js';
import { listingWithinRange } from './domain/services/rangeFilter.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlNotificationRepository } from './infrastructure/persistence/libsql/LibsqlNotificationRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

function dealTitle(d: ScoredListing): string {
  return `${d.match.criteria.brand} ${d.match.criteria.model} — ${madFmt.format(d.listing.priceMAD)} MAD`;
}

/**
 * Pure fan-out: turn freshly-scanned good deals into per-watcher notifications.
 * A deal alerts a watcher only if it falls inside that user's saved budget/year
 * range, so alerts stay relevant. Kept side-effect-free so it's easy to test.
 */
export function newDealNotifications(
  deals: readonly ScoredListing[],
  watchersByModel: ReadonlyMap<string, readonly string[]>,
  rangeFor: (userId: string) => SearchRange,
): NewNotification[] {
  const rows: NewNotification[] = [];
  for (const deal of deals) {
    const watchers = watchersByModel.get(deal.match.criteria.id) ?? [];
    for (const userId of watchers) {
      if (!listingWithinRange(deal.listing, rangeFor(userId))) continue;
      rows.push({
        userId,
        type: 'new_deal',
        sourceId: deal.listing.sourceId,
        externalId: deal.listing.externalId,
        modelId: deal.match.criteria.id,
        priceMAD: deal.listing.priceMAD,
        oldPriceMAD: null,
        url: deal.listing.url,
        imageUrl: deal.listing.imageUrl ?? null,
        title: dealTitle(deal),
      });
    }
  }
  return rows;
}

export interface AlertOutcome {
  /** Notification rows built and offered to the store (dedup may drop some). */
  readonly candidates: number;
}

/**
 * After a scan, alert users about fresh good deals for the models they follow.
 * Idempotent: the store's unique index drops any (user, listing) it has already
 * alerted, so re-running a scan never double-notifies. Email delivery is
 * layered on in a later phase.
 */
export async function runUserAlerts(report: DailyReport): Promise<AlertOutcome> {
  if (report.goodDeals.length === 0) return { candidates: 0 };

  const env = loadEnv();
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const notifications = new LibsqlNotificationRepository(db);
    const rangeRepo = new LibsqlUserSearchRangeRepository(db);

    const modelIds = [...new Set(report.goodDeals.map((d) => d.match.criteria.id))];
    const watchersByModel = await watchersOf(db, modelIds);

    // Resolve every involved watcher's range up front, then fan out purely.
    const userIds = new Set<string>();
    for (const users of watchersByModel.values()) for (const u of users) userIds.add(u);
    const rangeByUser = new Map<string, SearchRange>();
    for (const userId of userIds) {
      rangeByUser.set(userId, (await rangeRepo.get(userId)) ?? DEFAULT_SEARCH_RANGE);
    }

    const rows = newDealNotifications(
      report.goodDeals,
      watchersByModel,
      (userId) => rangeByUser.get(userId) ?? DEFAULT_SEARCH_RANGE,
    );
    await notifications.insertMany(rows);
    return { candidates: rows.length };
  } finally {
    db.close();
  }
}

/** modelId -> userIds following it, for the given models. */
async function watchersOf(db: Client, modelIds: readonly string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (modelIds.length === 0) return map;
  const placeholders = modelIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT user_id, model_id FROM user_watched_models WHERE model_id IN (${placeholders})`,
    args: [...modelIds],
  });
  for (const row of result.rows as unknown as { user_id: string; model_id: string }[]) {
    const list = map.get(row.model_id) ?? [];
    list.push(row.user_id);
    map.set(row.model_id, list);
  }
  return map;
}
