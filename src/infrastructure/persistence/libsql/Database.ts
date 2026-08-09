import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import type { Env } from '../../../config/env.js';
import { loadEnv } from '../../../config/env.js';
import { ADDITIVE_COLUMNS, MIGRATIONS } from './schema.js';

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

function createDbClient(config: DatabaseConfig): Client {
  return createClient(
    config.authToken ? { url: config.url, authToken: config.authToken } : { url: config.url },
  );
}

/** Shared durable clients ignore close() so existing finally-blocks stay safe. */
function wrapSharedClient(client: Client): Client {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'close') return () => undefined;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function applyMigrations(client: Client): Promise<void> {
  for (const statement of MIGRATIONS) {
    await client.execute(statement);
  }
  await ensureColumns(client);
}

async function ensureMigrated(config: DatabaseConfig): Promise<void> {
  if (!shouldCacheMigration(config.url)) return;
  if (migratedUrls.has(config.url)) return;

  let pending = migrateInFlight.get(config.url);
  if (!pending) {
    pending = (async () => {
      const client = createDbClient(config);
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
 * code path serves the local CLI (a `file:` URL) and Vercel (a Turso
 * `libsql://` URL) — only the config differs.
 *
 * For durable databases, schema migrations run at most once per process and
 * a single shared client is reused (close is a no-op). `:memory:` still gets
 * a fresh migrated client per open for test isolation.
 */
export async function openDatabase(config: DatabaseConfig): Promise<Client> {
  ensureLocalDirectoryExists(config.url);

  if (shouldCacheMigration(config.url)) {
    await ensureMigrated(config);
    const key = sharedClientKey(config);
    let shared = sharedClients.get(key);
    if (!shared) {
      shared = createDbClient(config);
      sharedClients.set(key, shared);
    }
    return wrapSharedClient(shared);
  }

  const client = createDbClient(config);
  await applyMigrations(client);
  return client;
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
