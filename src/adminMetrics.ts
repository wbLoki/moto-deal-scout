import type { Client } from '@libsql/client';
import type { VehicleType } from './domain/entities/VehicleType.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';

export interface DailyCount {
  readonly day: string;
  readonly count: number;
}

export interface LabeledCount {
  readonly label: string;
  readonly count: number;
}

export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: string;
  readonly method: 'password' | 'social';
  readonly watchedCount: number;
  readonly onboarded: boolean;
  readonly hasRange: boolean;
  readonly createdAt: string;
}

export interface AdminMetrics {
  readonly users: {
    readonly total: number;
    readonly new24h: number;
    readonly new7d: number;
    readonly admins: number;
    readonly onboarded: number;
    readonly withWatchlist: number;
    readonly withCustomRange: number;
    /** Sign-up method: password vs social (OAuth). */
    readonly byMethod: { password: number; social: number };
    /** New sign-ups per day, most recent first. */
    readonly signupsByDay: readonly DailyCount[];
  };
  readonly watchlist: {
    readonly totalFollows: number;
    readonly topModels: readonly LabeledCount[];
  };
  readonly requests: {
    readonly total: number;
    readonly pending: number;
    readonly approved: number;
    readonly rejected: number;
  };
  readonly listings: {
    readonly total: number;
    readonly goodDeals: number;
    readonly bySource: readonly LabeledCount[];
  };
}

async function scalar(client: Client, sql: string, args: unknown[] = []): Promise<number> {
  const result = await client.execute({ sql, args: args as never });
  return Number((result.rows[0] as unknown as { n: number } | undefined)?.n ?? 0);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Aggregates everything the admin analytics page shows, from one DB connection. */
export async function getAdminMetrics(): Promise<AdminMetrics> {
  const db = await openDatabaseFromEnv();
  try {
    const [total, new24h, new7d, admins, onboarded, withWatchlist, withCustomRange, password] =
      await Promise.all([
        scalar(db, 'SELECT COUNT(*) AS n FROM users'),
        scalar(db, 'SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', [isoDaysAgo(1)]),
        scalar(db, 'SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', [isoDaysAgo(7)]),
        scalar(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
        scalar(db, 'SELECT COUNT(*) AS n FROM user_onboarding'),
        scalar(db, 'SELECT COUNT(DISTINCT user_id) AS n FROM user_watched_models'),
        scalar(db, 'SELECT COUNT(*) AS n FROM user_search_ranges'),
        scalar(db, 'SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL'),
      ]);

    const signupRows = await db.execute(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
         FROM users GROUP BY day ORDER BY day DESC LIMIT 14`,
    );
    const signupsByDay = (signupRows.rows as unknown as { day: string; n: number }[]).map((r) => ({
      day: r.day,
      count: Number(r.n),
    }));

    const totalFollows = await scalar(db, 'SELECT COUNT(*) AS n FROM user_watched_models');
    const topRows = await db.execute(
      `SELECT w.model_id AS id, COALESCE(m.brand || ' ' || m.model, w.model_id) AS label, COUNT(*) AS n
         FROM user_watched_models w
         LEFT JOIN models m ON m.id = w.model_id
        GROUP BY w.model_id ORDER BY n DESC LIMIT 8`,
    );
    const topModels = (topRows.rows as unknown as { label: string; n: number }[]).map((r) => ({
      label: r.label,
      count: Number(r.n),
    }));

    const reqRows = await db.execute(
      'SELECT status, COUNT(*) AS n FROM model_requests GROUP BY status',
    );
    const reqByStatus = new Map(
      (reqRows.rows as unknown as { status: string; n: number }[]).map((r) => [
        r.status,
        Number(r.n),
      ]),
    );
    const reqTotal = [...reqByStatus.values()].reduce((a, b) => a + b, 0);

    const totalListings = await scalar(db, 'SELECT COUNT(*) AS n FROM listings');
    const goodDeals = await scalar(db, 'SELECT COUNT(*) AS n FROM listings WHERE is_good_deal = 1');
    const sourceRows = await db.execute(
      'SELECT source_id AS label, COUNT(*) AS n FROM listings GROUP BY source_id ORDER BY n DESC',
    );
    const bySource = (sourceRows.rows as unknown as { label: string; n: number }[]).map((r) => ({
      label: r.label,
      count: Number(r.n),
    }));

    return {
      users: {
        total,
        new24h,
        new7d,
        admins,
        onboarded,
        withWatchlist,
        withCustomRange,
        byMethod: { password, social: total - password },
        signupsByDay,
      },
      watchlist: { totalFollows, topModels },
      requests: {
        total: reqTotal,
        pending: reqByStatus.get('pending') ?? 0,
        approved: reqByStatus.get('approved') ?? 0,
        rejected: reqByStatus.get('rejected') ?? 0,
      },
      listings: { total: totalListings, goodDeals, bySource },
    };
  } finally {
    db.close();
  }
}

export interface ScannedListing {
  readonly sourceId: string;
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly priceMAD: number;
  readonly year: number | null;
  readonly mileageKm: number | null;
  readonly city: string;
  readonly modelId: string;
  readonly scoreTotal: number;
  readonly isGoodDeal: boolean;
  /** Marketplace publish date (seller's ad date). Often years old on Biker. */
  readonly postedAt: string | null;
  /** When our crawler last saw it. */
  readonly scrapedAt: string;
  /** When we first stored it (drives the "new" count). */
  readonly firstSeenAt: string;
}

export interface ScannedListingsPage {
  readonly rows: readonly ScannedListing[];
  /** Total rows matching the filter (across all pages). */
  readonly total: number;
  readonly sources: readonly string[];
  /** 1-based page number returned. */
  readonly page: number;
  readonly pageSize: number;
  /** Total pages for the current filter (at least 1). */
  readonly totalPages: number;
}

/** Which timestamp the date filter applies to. */
export type ScannedDateField = 'scraped_at' | 'posted_at' | 'created_at';

const DATE_FIELDS: readonly ScannedDateField[] = ['scraped_at', 'posted_at', 'created_at'];

/** Coerces arbitrary input to a whitelisted column (guards the un-parameterizable field name). */
export function toScannedDateField(value: string | undefined): ScannedDateField {
  return DATE_FIELDS.includes(value as ScannedDateField)
    ? (value as ScannedDateField)
    : 'scraped_at';
}

export interface ScannedListingsQuery {
  /** Restrict to one source id ('avito' | 'biker'); undefined = all. */
  readonly source?: string;
  /** Case-insensitive substring match on the title; undefined = no filter. */
  readonly search?: string;
  /** Which date column the from/to bounds apply to. Defaults to scraped_at. */
  readonly dateField?: ScannedDateField;
  /** Inclusive lower bound as a YYYY-MM-DD day; undefined = no lower bound. */
  readonly from?: string;
  /** Inclusive upper bound as a YYYY-MM-DD day; undefined = no upper bound. */
  readonly to?: string;
  /** 1-based page number. Defaults to 1. */
  readonly page?: number;
  /** Rows per page. Defaults to 50, capped at 200. */
  readonly pageSize?: number;
  /** Restrict to one vehicle market. Defaults to motorcycle. */
  readonly vehicleType?: VehicleType;
}

interface ScannedRow {
  source_id: string;
  external_id: string;
  url: string;
  title: string;
  price_mad: number;
  year: number | null;
  mileage_km: number | null;
  city: string;
  matched_model_id: string;
  score_total: number;
  is_good_deal: number;
  posted_at: string | null;
  scraped_at: string;
  created_at: string;
}

/**
 * The admin "scan log": every stored listing, newest-scraped first, with the
 * three timestamps side by side (posted / scraped / first-seen) so it's obvious
 * why an old-dated ad (e.g. a Biker bike posted in 2022 but still live) shows up.
 */
export async function listScannedListings(
  query: ScannedListingsQuery = {},
): Promise<ScannedListingsPage> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
  const where: string[] = [];
  const args: unknown[] = [];
  if (query.source) {
    where.push('source_id = ?');
    args.push(query.source);
  }
  if (query.search && query.search.trim()) {
    where.push('LOWER(title) LIKE ?');
    args.push(`%${query.search.trim().toLowerCase()}%`);
  }
  // Compare on the day portion so a YYYY-MM-DD bound is inclusive at both ends.
  // The field is whitelisted (toScannedDateField), never user text, so it's safe
  // to interpolate — bind values can't be used for a column name.
  const dateField = toScannedDateField(query.dateField);
  if (query.from) {
    where.push(`substr(${dateField}, 1, 10) >= ?`);
    args.push(query.from);
  }
  if (query.to) {
    where.push(`substr(${dateField}, 1, 10) <= ?`);
    args.push(query.to);
  }
  const vehicleType = query.vehicleType ?? 'motorcycle';
  where.push("COALESCE(vehicle_type, 'motorcycle') = ?");
  args.push(vehicleType);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const db = await openDatabaseFromEnv();
  try {
    const total = await scalar(db, `SELECT COUNT(*) AS n FROM listings ${whereSql}`, args);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);
    const offset = (page - 1) * pageSize;

    const sourcesRes = await db.execute({
      sql: `SELECT DISTINCT source_id AS s FROM listings
             WHERE COALESCE(vehicle_type, 'motorcycle') = ?
             ORDER BY s`,
      args: [vehicleType],
    });
    const sources = (sourcesRes.rows as unknown as { s: string }[]).map((r) => r.s);

    const result = await db.execute({
      sql: `SELECT source_id, external_id, url, title, price_mad, year, mileage_km, city,
                   matched_model_id, score_total, is_good_deal, posted_at, scraped_at, created_at
              FROM listings ${whereSql}
             ORDER BY scraped_at DESC, created_at DESC
             LIMIT ? OFFSET ?`,
      args: [...args, pageSize, offset] as never,
    });
    const rows = (result.rows as unknown as ScannedRow[]).map((r) => ({
      sourceId: r.source_id,
      externalId: r.external_id,
      url: r.url,
      title: r.title,
      priceMAD: r.price_mad,
      year: r.year,
      mileageKm: r.mileage_km,
      city: r.city,
      modelId: r.matched_model_id,
      scoreTotal: r.score_total,
      isGoodDeal: r.is_good_deal === 1,
      postedAt: r.posted_at,
      scrapedAt: r.scraped_at,
      firstSeenAt: r.created_at,
    }));

    return { rows, total, sources, page, pageSize, totalPages };
  } finally {
    db.close();
  }
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  has_password: number;
  watched_count: number;
  onboarded: number | null;
  has_range: number | null;
  created_at: string;
}

/** Every account with the at-a-glance info shown on the admin Users tab. */
export async function listUsers(): Promise<AdminUser[]> {
  const db = await openDatabaseFromEnv();
  try {
    const result = await db.execute(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              (u.password_hash IS NOT NULL) AS has_password,
              (SELECT COUNT(*) FROM user_saved_searches s WHERE s.user_id = u.id) AS watched_count,
              (SELECT 1 FROM user_onboarding o WHERE o.user_id = u.id) AS onboarded,
              (SELECT 1 FROM user_search_ranges r WHERE r.user_id = u.id) AS has_range
         FROM users u
        ORDER BY u.created_at DESC`,
    );
    return (result.rows as unknown as UserRow[]).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      method: r.has_password ? 'password' : 'social',
      watchedCount: Number(r.watched_count),
      onboarded: Boolean(r.onboarded),
      hasRange: Boolean(r.has_range),
      createdAt: r.created_at,
    }));
  } finally {
    db.close();
  }
}
