import type { Client } from '@libsql/client';
import { loadEnv } from './config/env.js';
import type { DailyReport, PriceDrop } from './domain/entities/DailyReport.js';
import type { NewNotification } from './domain/entities/Notification.js';
import type { SavedSearch } from './domain/entities/SavedSearch.js';
import type { ScoredListing } from './domain/entities/ScoredListing.js';
import { listingMatchesSavedSearch } from './domain/services/savedSearchMatch.js';
import {
  EmailAlertProvider,
  type DigestItem,
} from './infrastructure/notifications/EmailAlertProvider.js';
import { WhatsAppAlertProvider } from './infrastructure/notifications/WhatsAppAlertProvider.js';
import { openDatabase, resolveDatabaseConfig } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlNotificationRepository } from './infrastructure/persistence/libsql/LibsqlNotificationRepository.js';
import { LibsqlSavedSearchRepository } from './infrastructure/persistence/libsql/LibsqlSavedSearchRepository.js';
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

function searchesByUser(
  searches: readonly SavedSearch[],
): Map<string, SavedSearch[]> {
  const map = new Map<string, SavedSearch[]>();
  for (const s of searches) {
    const list = map.get(s.userId) ?? [];
    list.push(s);
    map.set(s.userId, list);
  }
  return map;
}

function matchesAnySearch(
  listing: ScoredListing['listing'],
  modelId: string,
  brand: string,
  searches: readonly SavedSearch[],
): boolean {
  return searches.some((s) => listingMatchesSavedSearch(listing, s, modelId, brand));
}

/**
 * Pure fan-out: a good deal alerts a user when it matches any of their saved
 * searches. Kept side-effect-free so it's easy to test.
 */
export function newDealNotifications(
  deals: readonly ScoredListing[],
  searches: readonly SavedSearch[],
): NewNotification[] {
  const byUser = searchesByUser(searches);
  const rows: NewNotification[] = [];
  for (const deal of deals) {
    for (const [userId, userSearches] of byUser) {
      if (
        !matchesAnySearch(
          deal.listing,
          deal.match.criteria.id,
          deal.match.criteria.brand,
          userSearches,
        )
      ) {
        continue;
      }
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
 * alerted; other users are alerted when the cheaper listing matches a search.
 */
export function priceDropNotifications(
  drops: readonly PriceDrop[],
  searches: readonly SavedSearch[],
  saversByListing: ReadonlyMap<string, readonly string[]>,
): NewNotification[] {
  const byUser = searchesByUser(searches);
  const rows: NewNotification[] = [];
  for (const drop of drops) {
    const key = listingKey(drop.listing.sourceId, drop.listing.externalId);
    const recipients = new Set<string>(saversByListing.get(key) ?? []);
    for (const [userId, userSearches] of byUser) {
      if (matchesAnySearch(drop.listing, drop.model.id, drop.model.brand, userSearches)) {
        recipients.add(userId);
      }
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
 * After a scan, alert users about fresh good deals matching their saved
 * searches. Idempotent: the store's unique index drops any (user, listing) it
 * has already alerted. Email and WhatsApp delivery are layered on and must not
 * block each other or in-app alerts.
 */
export async function runUserAlerts(report: DailyReport): Promise<AlertOutcome> {
  if (report.goodDeals.length === 0 && report.priceDrops.length === 0) {
    return { candidates: 0 };
  }

  const env = loadEnv();
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const notifications = new LibsqlNotificationRepository(db);
    const searches = await new LibsqlSavedSearchRepository(db).listAll();
    const saversByListing = await saversOf(db, report.priceDrops);

    const rows = [
      ...newDealNotifications(report.goodDeals, searches),
      ...priceDropNotifications(report.priceDrops, searches, saversByListing),
    ];
    await notifications.insertMany(rows);
    await sendPendingDigests(db, env, notifications);
    return { candidates: rows.length };
  } finally {
    db.close();
  }
}

/**
 * Emails and WhatsApps any not-yet-delivered notifications. Each channel is
 * independent: a failed send is logged and those rows stay pending.
 */
async function sendPendingDigests(
  db: Client,
  env: Env,
  notifications: LibsqlNotificationRepository,
): Promise<void> {
  await sendEmailDigests(db, env, notifications);
  await sendWhatsAppDigests(db, env, notifications);
}

async function sendEmailDigests(
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

async function sendWhatsAppDigests(
  db: Client,
  env: Env,
  notifications: LibsqlNotificationRepository,
): Promise<void> {
  const provider = WhatsAppAlertProvider.fromEnv(env);
  if (!provider) return;

  const grouped = await notifications.listUnwhatsappedGroupedByUser();
  if (grouped.size === 0) return;

  const prefs = await whatsappPrefsFor(db, [...grouped.keys()]);
  for (const [userId, list] of grouped) {
    const pref = prefs.get(userId);
    if (!pref?.optIn || !pref.phone) continue;
    try {
      await provider.sendDigests([{ phone: pref.phone, notifications: list }]);
      await notifications.markWhatsapped(list.map((n) => n.id));
    } catch (err) {
      console.error('[alerts] failed to send WhatsApp digest:', err);
    }
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

async function whatsappPrefsFor(
  db: Client,
  userIds: readonly string[],
): Promise<Map<string, { phone: string; optIn: boolean }>> {
  const map = new Map<string, { phone: string; optIn: boolean }>();
  if (userIds.length === 0) return map;
  const placeholders = userIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT id, phone, whatsapp_opt_in FROM users WHERE id IN (${placeholders})`,
    args: [...userIds],
  });
  for (const row of result.rows as unknown as {
    id: string;
    phone: string | null;
    whatsapp_opt_in: number | null;
  }[]) {
    map.set(row.id, {
      phone: (row.phone ?? '').trim(),
      optIn: Number(row.whatsapp_opt_in) === 1,
    });
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
