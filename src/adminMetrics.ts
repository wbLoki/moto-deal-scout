import type { Client } from '@libsql/client';
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
              (SELECT COUNT(*) FROM user_watched_models w WHERE w.user_id = u.id) AS watched_count,
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
