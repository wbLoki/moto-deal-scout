import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { MIGRATIONS } from './schema.js';

export interface DatabaseConfig {
  /**
   * A libsql URL. Either a remote Turso database (`libsql://<db>.turso.io`),
   * a local file (`file:./data/moto-deal-scout.sqlite`), or `:memory:`.
   */
  readonly url: string;
  /** Auth token, required for remote Turso databases. */
  readonly authToken?: string;
}

/**
 * Opens (creating if needed) the database and applies migrations. The same
 * code path serves the local CLI (a `file:` URL) and Vercel (a Turso
 * `libsql://` URL) — only the config differs.
 */
export async function openDatabase(config: DatabaseConfig): Promise<Client> {
  ensureLocalDirectoryExists(config.url);

  const client = createClient(
    config.authToken ? { url: config.url, authToken: config.authToken } : { url: config.url },
  );

  for (const statement of MIGRATIONS) {
    await client.execute(statement);
  }

  return client;
}

/** For a `file:` URL, make sure the parent directory exists before opening. */
function ensureLocalDirectoryExists(url: string): void {
  if (!url.startsWith('file:')) return;
  const path = url.slice('file:'.length);
  if (path && path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
}
