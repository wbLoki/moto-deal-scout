import type { Logger } from 'pino';
import type { Listing, MarketplaceId } from '../../../domain/entities/Listing.js';
import type { ScoredListing } from '../../../domain/entities/ScoredListing.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';

/**
 * Idempotent DDL (CREATE ... IF NOT EXISTS), which is all a single-table
 * personal tool like this needs — reach for a real migration runner only
 * if the schema grows more complex. Runs identically against a local
 * SQLite file and a remote Turso database.
 */
export const MIGRATIONS: readonly string[] = [
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
  // Deprecated: the pre-multi-user global range. Kept so existing databases
  // migrate cleanly; per-user ranges now live in user_search_ranges.
  `CREATE TABLE IF NOT EXISTS search_settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    budget_min  INTEGER NOT NULL,
    budget_max  INTEGER NOT NULL,
    year_min    INTEGER NOT NULL,
    year_max    INTEGER NOT NULL,
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  // Accounts. password_hash is null for OAuth-only users; role is 'user' | 'admin'.
  `CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT,
    password_hash TEXT,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  // Per-user budget/year window used to filter their personal dashboard view.
  `CREATE TABLE IF NOT EXISTS user_search_ranges (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    budget_min  INTEGER NOT NULL,
    budget_max  INTEGER NOT NULL,
    year_min    INTEGER NOT NULL,
    year_max    INTEGER NOT NULL,
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  // Admin-managed models that the scanner searches for. Seeded from
  // defaultCriteria on first run; approved model requests are inserted here.
  `CREATE TABLE IF NOT EXISTS models (
    id             TEXT PRIMARY KEY,
    brand          TEXT    NOT NULL,
    model          TEXT    NOT NULL,
    aliases        TEXT    NOT NULL DEFAULT '[]',
    price_min      INTEGER NOT NULL,
    price_max      INTEGER NOT NULL,
    max_mileage_km INTEGER NOT NULL,
    min_year       INTEGER NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  // User-submitted model suggestions awaiting admin approval.
  `CREATE TABLE IF NOT EXISTS model_requests (
    id          TEXT PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand       TEXT    NOT NULL,
    model       TEXT    NOT NULL,
    note        TEXT,
    status      TEXT    NOT NULL DEFAULT 'pending',
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    decided_at  TEXT,
    decided_by  TEXT    REFERENCES users(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_model_requests_status ON model_requests (status, created_at)`,
];

/**
 * Column order shared by the INSERT statement and {@link toInsertArgs}.
 * Keep the two in lockstep — positional args mean a reordering here that
 * isn't mirrored there silently corrupts every row.
 */
const INSERT_COLUMNS = [
  'source_id',
  'external_id',
  'url',
  'title',
  'description',
  'price_mad',
  'year',
  'mileage_km',
  'city',
  'image_url',
  'posted_at',
  'scraped_at',
  'matched_model_id',
  'match_confidence',
  'score_price',
  'score_mileage',
  'score_year',
  'score_city',
  'score_total',
  'score_reasons',
  'is_good_deal',
] as const;

const UPDATE_ON_CONFLICT = INSERT_COLUMNS.filter((c) => c !== 'source_id' && c !== 'external_id')
  .map((c) => `${c} = excluded.${c}`)
  .join(',\n    ');

export const UPSERT_SQL = `
  INSERT INTO listings (${INSERT_COLUMNS.join(', ')})
  VALUES (${INSERT_COLUMNS.map(() => '?').join(', ')})
  ON CONFLICT (source_id, external_id) DO UPDATE SET
    ${UPDATE_ON_CONFLICT}
`;

/** A libsql value: what a bound parameter may be. */
type SqlValue = string | number | null;

/** Flattens a scored listing into the positional args for {@link UPSERT_SQL}. */
export function toInsertArgs(scored: ScoredListing): SqlValue[] {
  const { listing, match, score } = scored;
  return [
    listing.sourceId,
    listing.externalId,
    listing.url,
    listing.title,
    listing.description ?? null,
    listing.priceMAD,
    listing.year ?? null,
    listing.mileageKm ?? null,
    listing.city,
    listing.imageUrl ?? null,
    listing.postedAt?.toISOString() ?? null,
    listing.scrapedAt.toISOString(),
    match.criteria.id,
    match.confidence,
    score.price,
    score.mileage,
    score.year,
    score.city,
    score.total,
    JSON.stringify(score.reasons),
    scored.isGoodDeal ? 1 : 0,
  ];
}

/** One row from the `listings` table, as returned by the libsql client. */
export interface ListingRow {
  source_id: string;
  external_id: string;
  url: string;
  title: string;
  description: string | null;
  price_mad: number;
  year: number | null;
  mileage_km: number | null;
  city: string;
  image_url: string | null;
  posted_at: string | null;
  scraped_at: string;
  matched_model_id: string;
  match_confidence: number;
  score_price: number;
  score_mileage: number;
  score_year: number;
  score_city: number;
  score_total: number;
  score_reasons: string;
  is_good_deal: number;
}

/**
 * Rebuilds a {@link ScoredListing} from a stored row. Only the matched
 * model's id is persisted (the rest is config, not data), so a row that
 * references a model no longer in the loaded criteria can't be
 * reconstructed — those are logged and skipped rather than throwing.
 */
export function mapRowToScoredListing(
  row: ListingRow,
  modelsById: ReadonlyMap<string, ModelCriteria>,
  logger?: Logger,
): ScoredListing | undefined {
  const criteria = modelsById.get(row.matched_model_id);
  if (!criteria) {
    logger?.warn(
      { modelId: row.matched_model_id },
      'stored listing references a model no longer in criteria config; skipping',
    );
    return undefined;
  }

  const listing: Listing = {
    sourceId: row.source_id as MarketplaceId,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    description: row.description ?? undefined,
    priceMAD: row.price_mad,
    year: row.year ?? undefined,
    mileageKm: row.mileage_km ?? undefined,
    city: row.city,
    imageUrl: row.image_url ?? undefined,
    postedAt: row.posted_at ? new Date(row.posted_at) : undefined,
    scrapedAt: new Date(row.scraped_at),
  };

  return {
    listing,
    match: { criteria, confidence: row.match_confidence },
    score: {
      price: row.score_price,
      mileage: row.score_mileage,
      year: row.score_year,
      city: row.score_city,
      total: row.score_total,
      reasons: JSON.parse(row.score_reasons) as string[],
    },
    isGoodDeal: row.is_good_deal === 1,
  };
}
