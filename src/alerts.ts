import type { Client } from '@libsql/client';
import { loadEnv } from './config/env.js';
import { resolveDatabaseConfig } from './container.js';
import type { DailyReport, PriceDrop } from './domain/entities/DailyReport.js';
import type { NewNotification } from './domain/entities/Notification.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import type { SearchRange } from './domain/entities/SearchCriteria.js';
import { listingWithinRange } from './domain/services/rangeFilter.js';
import {
  EmailAlertProvider,
  type DigestItem,
} from './infrastructure/notifications/EmailAlertProvider.js';
import { openDatabase } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlNotificationRepository } from './infrastructure/persistence/libsql/LibsqlNotificationRepository.js';
import { LibsqlUserSearchRangeRepository } from './infrastructure/persistence/libsql/LibsqlUserSearchRangeRepository.js';
import { DEFAULT_SEARCH_RANGE } from './settingsModel.js';
import type { Env } from './config/env.js';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

function dealTitle(d: ScoredListing): string {
  return `${d.match.criteria.brand} ${d.match.criteria.model} — ${madFmt.format(d.listing.priceMAD)} MAD`;
}

function dropTitle(d: PriceDrop): string {
  return `${d.model.brand} ${d.model.model} — ${madFmt.format(d.newPriceMAD)} MAD`;
}

function listingKey(sourceId: string, externalId: string): string {
  return `${sourceId}:${externalId}`;
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

/**
 * Pure fan-out for price drops. Savers of the exact listing are always
 * alerted (they explicitly bookmarked it); watchers of the model are alerted
 * only when the (now cheaper) listing sits inside their saved range.
 */
export function priceDropNotifications(
  drops: readonly PriceDrop[],
  watchersByModel: ReadonlyMap<string, readonly string[]>,
  saversByListing: ReadonlyMap<string, readonly string[]>,
  rangeFor: (userId: string) => SearchRange,
): NewNotification[] {
  const rows: NewNotification[] = [];
  for (const drop of drops) {
    const key = listingKey(drop.listing.sourceId, drop.listing.externalId);
    const recipients = new Set<string>(saversByListing.get(key) ?? []);
    for (const userId of watchersByModel.get(drop.model.id) ?? []) {
      if (listingWithinRange(drop.listing, rangeFor(userId))) recipients.add(userId);
    }
    for (const userId of recipients) {
      rows.push({
        userId,
        type: 'price_drop',
        sourceId: drop.listing.sourceId,
        externalId: drop.listing.externalId,
        modelId: drop.model.id,
        priceMAD: drop.newPriceMAD,
        oldPriceMAD: drop.oldPriceMAD,
        url: drop.listing.url,
        imageUrl: drop.listing.imageUrl ?? null,
        title: dropTitle(drop),
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
  if (report.goodDeals.length === 0 && report.priceDrops.length === 0) {
    return { candidates: 0 };
  }

  const env = loadEnv();
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const notifications = new LibsqlNotificationRepository(db);
    const rangeRepo = new LibsqlUserSearchRangeRepository(db);

    // Watchers of every model touched by a new deal or a price drop.
    const modelIds = [
      ...new Set([
        ...report.goodDeals.map((d) => d.match.criteria.id),
        ...report.priceDrops.map((d) => d.model.id),
      ]),
    ];
    const watchersByModel = await watchersOf(db, modelIds);
    const saversByListing = await saversOf(db, report.priceDrops);

    // Resolve every involved watcher's range up front, then fan out purely.
    const userIds = new Set<string>();
    for (const users of watchersByModel.values()) for (const u of users) userIds.add(u);
    const rangeByUser = new Map<string, SearchRange>();
    for (const userId of userIds) {
      rangeByUser.set(userId, (await rangeRepo.get(userId)) ?? DEFAULT_SEARCH_RANGE);
    }
    const rangeFor = (userId: string): SearchRange =>
      rangeByUser.get(userId) ?? DEFAULT_SEARCH_RANGE;

    const rows = [
      ...newDealNotifications(report.goodDeals, watchersByModel, rangeFor),
      ...priceDropNotifications(report.priceDrops, watchersByModel, saversByListing, rangeFor),
    ];
    await notifications.insertMany(rows);
    await sendPendingDigests(db, env, notifications);
    return { candidates: rows.length };
  } finally {
    db.close();
  }
}

/**
 * Emails any not-yet-emailed notifications as one digest per user. No-ops when
 * email isn't configured (in-app alerts stand alone). A failed send is logged
 * and the rows stay pending, so the next scan retries them rather than losing
 * the alert or crashing the scan.
 */
async function sendPendingDigests(
  db: Client,
  env: Env,
  notifications: LibsqlNotificationRepository,
): Promise<void> {
  const provider = EmailAlertProvider.fromEnv(env);
  if (!provider) return;

  const grouped = await notifications.listUnemailedGroupedByUser();
  if (grouped.size === 0) return;

  const emails = await emailsFor(db, [...grouped.keys()]);
  const items: DigestItem[] = [];
  const sentIds: string[] = [];
  for (const [userId, list] of grouped) {
    const email = emails.get(userId);
    if (!email) continue;
    items.push({ email, notifications: list });
    for (const n of list) sentIds.push(n.id);
  }
  if (items.length === 0) return;

  try {
    await provider.sendDigests(items);
    await notifications.markEmailed(sentIds);
  } catch (err) {
    console.error('[alerts] failed to send email digests:', err);
  }
}

/** userId -> email, for the given users. */
async function emailsFor(db: Client, userIds: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const placeholders = userIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT id, email FROM users WHERE id IN (${placeholders})`,
    args: [...userIds],
  });
  for (const row of result.rows as unknown as { id: string; email: string }[]) {
    map.set(row.id, row.email);
  }
  return map;
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

/** "sourceId:externalId" -> userIds who saved that listing, for the dropped listings. */
async function saversOf(db: Client, drops: readonly PriceDrop[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (drops.length === 0) return map;
  const clauses = drops.map(() => '(source_id = ? AND external_id = ?)').join(' OR ');
  const args = drops.flatMap((d) => [d.listing.sourceId, d.listing.externalId]);
  const result = await db.execute({
    sql: `SELECT user_id, source_id, external_id FROM user_saved_listings WHERE ${clauses}`,
    args,
  });
  for (const row of result.rows as unknown as {
    user_id: string;
    source_id: string;
    external_id: string;
  }[]) {
    const key = listingKey(row.source_id, row.external_id);
    const list = map.get(key) ?? [];
    list.push(row.user_id);
    map.set(key, list);
  }
  return map;
}
