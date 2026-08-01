import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS listings (
    source_id         TEXT    NOT NULL,
    external_id       TEXT    NOT NULL,
    url               TEXT    NOT NULL,
    title             TEXT    NOT NULL,
    description       TEXT,
    price_mad         REAL    NOT NULL,
    year              INTEGER,
    mileage_km        INTEGER,
    city              TEXT    NOT NULL,
    image_url         TEXT,
    posted_at         TEXT,
    scraped_at        TEXT    NOT NULL,
    matched_model_id  TEXT    NOT NULL,
    match_confidence  REAL    NOT NULL,
    score_price       INTEGER NOT NULL,
    score_mileage     INTEGER NOT NULL,
    score_year        INTEGER NOT NULL,
    score_city        INTEGER NOT NULL,
    score_total       INTEGER NOT NULL,
    score_reasons     TEXT    NOT NULL,
    is_good_deal      INTEGER NOT NULL,
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (source_id, external_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listings_good_deal_created
     ON listings (is_good_deal, created_at)`,
];

/**
 * Opens (creating if needed) the SQLite database and applies migrations.
 * Migrations are plain idempotent DDL (CREATE TABLE/INDEX IF NOT EXISTS),
 * which is all a single-table personal tool like this needs; reach for a
 * real migration runner if the schema grows more complex.
 */
export function openDatabase(path: string): BetterSqlite3.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new BetterSqlite3(path);
  if (path !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  const migrate = db.transaction(() => {
    for (const statement of MIGRATIONS) {
      db.exec(statement);
    }
  });
  migrate();

  return db;
}
