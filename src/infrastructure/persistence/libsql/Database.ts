import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Client } from '@libsql/client';
import { fallbackDisplacementCc } from '../../../catalog/modelDisplacement.js';
import type { Env } from '../../../config/env.js';
import { loadEnv } from '../../../config/env.js';
import { ADDITIVE_COLUMNS, MIGRATIONS, POST_COLUMN_INDEXES } from './schema.js';

export interface DatabaseConfig {
  /**
   * A libsql URL. Either a remote Turso database (`libsql://<db>.turso.io`),
   * a local file (`file:./data/moto-deal-scout.sqlite`), or `:memory:`.
   */
  readonly url: string;
  /** Auth token, required for remote Turso databases. */
  readonly authToken?: string;
}

/** URLs that already had migrations applied in this process. */
const migratedUrls = new Set<string>();
/** In-flight migration promises, keyed by URL, so concurrent opens share one run. */
const migrateInFlight = new Map<string, Promise<void>>();
/** Process-scoped clients for durable URLs (key = url + auth token). */
const sharedClients = new Map<string, Client>();

/**
 * `:memory:` (and memory-mode file URLs) get a fresh empty DB per client, so
 * migrations must run on every open. Durable URLs only need them once per
 * process — re-running ~20 remote round-trips on every Vercel request was
 * the main reason soft navigations felt multi-second.
 */
function shouldCacheMigration(url: string): boolean {
  if (url === ':memory:') return false;
  if (url.startsWith('file:') && /[?&]mode=memory\b/i.test(url)) return false;
  return true;
}

function sharedClientKey(config: DatabaseConfig): string {
  return `${config.url}\0${config.authToken ?? ''}`;
}

/** The libsql client factory, as both the native and web entry points expose it. */
type CreateClient = (config: {
  url: string;
  authToken?: string;
  fetch?: (request: Request) => Promise<Response>;
}) => Client;

type NextPatchedFetch = typeof fetch & { _nextOriginalFetch?: typeof fetch };

/** True for remote Turso URLs (libsql://, https://, wss://) — anything but a local file/memory DB. */
function isRemoteUrl(url: string): boolean {
  return !url.startsWith('file:') && url !== ':memory:';
}

function isCloudflareWorker(): boolean {
  return (
    typeof globalThis.navigator === 'object' &&
    globalThis.navigator.userAgent === 'Cloudflare-Workers'
  );
}

/**
 * Next.js patches `globalThis.fetch` with OTel (`startActiveSpan`) and then
 * calls `fetch(request, { next: { fetchType } })`. OpenNext also replaces
 * `Request` with a subclass. Together, workerd's native fetch throws with an
 * empty message — the `at globalThis.fetch` / `startActiveSpan` stack in
 * Workers Logs on `GET /`. Bypass both by sending a URL string + init to the
 * pre-Next fetch.
 */
function fetchForLibsql(request: Request): Promise<Response> {
  const current = globalThis.fetch as NextPatchedFetch;
  const origin = (current._nextOriginalFetch ?? current).bind(globalThis);
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    redirect: request.redirect,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    if (typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream) {
      (init as RequestInit & { duplex: 'half' }).duplex = 'half';
    }
  }
  return origin(request.url, init).catch((err: unknown) => {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[libsql] ${request.method} ${request.url} failed: ${detail}`);
    throw err;
  });
}

/**
 * Loads the right libsql client factory for the URL. Remote Turso uses the
 * fetch-based `web` client — the only one that runs on Cloudflare Workers — and
 * importing that subpath explicitly is also what makes the bundler ship it.
 * Local `file:`/`:memory:` DBs (CLI, tests) use the native Node client, which is
 * never reached on Workers.
 */
async function loadCreateClient(url: string): Promise<CreateClient> {
  if (isRemoteUrl(url)) return (await import('@libsql/client/web')).createClient;
  return (await import('@libsql/client')).createClient;
}

async function createDbClient(config: DatabaseConfig): Promise<Client> {
  const createClient = await loadCreateClient(config.url);
  const remote = isRemoteUrl(config.url);
  return createClient({
    url: config.url,
    ...(config.authToken ? { authToken: config.authToken } : {}),
    ...(remote ? { fetch: fetchForLibsql } : {}),
  });
}

/** Shared durable clients ignore close() so existing finally-blocks stay safe. */
function wrapSharedClient(client: Client): Client {
  return new Proxy(client, {
    get(target, prop, receiver): unknown {
      if (prop === 'close') return (): void => undefined;
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

async function applyMigrations(client: Client): Promise<void> {
  for (const statement of MIGRATIONS) {
    await client.execute(statement);
  }
  await ensureColumns(client);
  for (const statement of POST_COLUMN_INDEXES) {
    await client.execute(statement);
  }
  await copyLegacySearchRanges(client);
  await copyWatchlistsToSavedSearches(client);
  await backfillListingDisplacement(client);
}

/**
 * Copies pre-cars `user_search_ranges` rows into the per-type table as
 * motorcycle ranges. Idempotent: skips users who already have a motorcycle row.
 */
async function copyLegacySearchRanges(client: Client): Promise<void> {
  await client.execute(`
    INSERT INTO user_vehicle_search_ranges
      (user_id, vehicle_type, budget_min, budget_max, year_min, year_max, updated_at)
    SELECT user_id, 'motorcycle', budget_min, budget_max, year_min, year_max, updated_at
      FROM user_search_ranges
     WHERE NOT EXISTS (
       SELECT 1 FROM user_vehicle_search_ranges r
        WHERE r.user_id = user_search_ranges.user_id AND r.vehicle_type = 'motorcycle'
     )
  `);
}

/**
 * One saved search per (user, vehicle type) from the old range + watchlist.
 * Users with a range but no watches get an open (any-model) search. Users with
 * watches but no range get the default budget/year for that type. Idempotent.
 */
async function copyWatchlistsToSavedSearches(client: Client): Promise<void> {
  await client.execute(`
    INSERT INTO user_saved_searches
      (id, user_id, name, vehicle_type, budget_min, budget_max, year_min, year_max,
       mileage_max, brands, cities, fuel_types, gearboxes, model_ids)
    SELECT
      lower(hex(randomblob(16))),
      r.user_id,
      CASE r.vehicle_type WHEN 'car' THEN 'Cars' ELSE 'Motos' END,
      r.vehicle_type,
      r.budget_min,
      r.budget_max,
      r.year_min,
      r.year_max,
      0,
      '[]',
      '[]',
      '[]',
      '[]',
      COALESCE((
        SELECT json_group_array(w.model_id)
          FROM user_watched_models w
          JOIN models m ON m.id = w.model_id
         WHERE w.user_id = r.user_id
           AND COALESCE(m.vehicle_type, 'motorcycle') = r.vehicle_type
      ), '[]')
      FROM user_vehicle_search_ranges r
     WHERE NOT EXISTS (
       SELECT 1 FROM user_saved_searches s
        WHERE s.user_id = r.user_id AND s.vehicle_type = r.vehicle_type
     )
  `);

  await client.execute(`
    INSERT INTO user_saved_searches
      (id, user_id, name, vehicle_type, budget_min, budget_max, year_min, year_max,
       mileage_max, brands, cities, fuel_types, gearboxes, model_ids)
    SELECT
      lower(hex(randomblob(16))),
      x.user_id,
      CASE x.vehicle_type WHEN 'car' THEN 'Cars' ELSE 'Motos' END,
      x.vehicle_type,
      0,
      CASE x.vehicle_type WHEN 'car' THEN 600000 ELSE 200000 END,
      CASE x.vehicle_type WHEN 'car' THEN 2010 ELSE 2015 END,
      CAST(strftime('%Y', 'now') AS INTEGER) + 1,
      0,
      '[]',
      '[]',
      '[]',
      '[]',
      COALESCE((
        SELECT json_group_array(w.model_id)
          FROM user_watched_models w
          JOIN models m ON m.id = w.model_id
         WHERE w.user_id = x.user_id
           AND COALESCE(m.vehicle_type, 'motorcycle') = x.vehicle_type
      ), '[]')
      FROM (
        SELECT w.user_id, COALESCE(m.vehicle_type, 'motorcycle') AS vehicle_type
          FROM user_watched_models w
          JOIN models m ON m.id = w.model_id
         GROUP BY w.user_id, COALESCE(m.vehicle_type, 'motorcycle')
      ) x
     WHERE NOT EXISTS (
       SELECT 1 FROM user_saved_searches s
        WHERE s.user_id = x.user_id AND s.vehicle_type = x.vehicle_type
     )
  `);
}

async function ensureMigrated(config: DatabaseConfig): Promise<void> {
  if (!shouldCacheMigration(config.url)) return;
  if (migratedUrls.has(config.url)) return;

  let pending = migrateInFlight.get(config.url);
  if (!pending) {
    pending = (async () => {
      const client = await createDbClient(config);
      try {
        await applyMigrations(client);
        migratedUrls.add(config.url);
      } finally {
        client.close();
        migrateInFlight.delete(config.url);
      }
    })();
    migrateInFlight.set(config.url, pending);
  }
  await pending;
}

/**
 * Opens (creating if needed) the database and applies migrations. The same
 * code path serves the local CLI (a `file:` URL) and Turso (`libsql://`) —
 * only the config differs.
 *
 * Cloudflare Workers skip DDL: each statement is a Turso HTTP subrequest, and
 * the Free plan caps those at 50 per invocation. Schema is applied by the CLI
 * / scanner, not on the request path. `:memory:` still migrates on every open
 * for test isolation. On Node, durable URLs migrate once per process and reuse
 * a shared client (close is a no-op).
 */
export async function openDatabase(config: DatabaseConfig): Promise<Client> {
  ensureLocalDirectoryExists(config.url);

  if (!shouldCacheMigration(config.url)) {
    const client = await createDbClient(config);
    await applyMigrations(client);
    return client;
  }

  if (isCloudflareWorker()) {
    return createDbClient(config);
  }

  await ensureMigrated(config);
  const key = sharedClientKey(config);
  let shared = sharedClients.get(key);
  if (!shared) {
    shared = await createDbClient(config);
    sharedClients.set(key, shared);
  }
  return wrapSharedClient(shared);
}

/**
 * Fills missing listing cc from the matched model's typical size (or 0).
 * Idempotent: only rows with NULL/0 displacement are touched.
 */
async function backfillListingDisplacement(client: Client): Promise<void> {
  const models = await client.execute('SELECT id, model, vehicle_type FROM models');
  for (const row of models.rows) {
    const id = typeof row['id'] === 'string' ? row['id'] : '';
    if (!id) continue;
    const vehicleType = typeof row['vehicle_type'] === 'string' ? row['vehicle_type'] : 'motorcycle';
    const model = typeof row['model'] === 'string' ? row['model'] : '';
    const cc = vehicleType === 'car' ? 0 : fallbackDisplacementCc(model);
    await client.execute({
      sql: `UPDATE listings
            SET displacement_cc = ?
          WHERE matched_model_id = ?
            AND (displacement_cc IS NULL OR displacement_cc = 0)`,
      args: [cc, id],
    });
  }
  await client.execute(
    `UPDATE listings SET displacement_cc = 0 WHERE displacement_cc IS NULL`,
  );
}

/** Adds any {@link ADDITIVE_COLUMNS} a table is missing (idempotent). */
async function ensureColumns(client: Client): Promise<void> {
  for (const { table, column, definition } of ADDITIVE_COLUMNS) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const exists = info.rows.some((r) => (r as unknown as { name: string }).name === column);
    if (!exists) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

/** Chooses the Turso database when configured, else a local SQLite file. */
export function resolveDatabaseConfig(env: Env): DatabaseConfig {
  if (env.DATABASE_URL) {
    return env.DATABASE_AUTH_TOKEN
      ? { url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN }
      : { url: env.DATABASE_URL };
  }
  return { url: `file:${env.DATABASE_PATH}` };
}

/** Opens a client using the ambient environment. Convenience for the web/auth layer. */
export function openDatabaseFromEnv(): Promise<Client> {
  return openDatabase(resolveDatabaseConfig(loadEnv()));
}

/** For a `file:` URL, make sure the parent directory exists before opening. */
function ensureLocalDirectoryExists(url: string): void {
  if (!url.startsWith('file:')) return;
  const path = url.slice('file:'.length);
  if (path && path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
}
