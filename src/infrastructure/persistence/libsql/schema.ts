import type { Logger } from 'pino';
import type { Listing, MarketplaceId } from '../../../domain/entities/Listing.js';
import type { ScoredListing } from '../../../domain/entities/ScoredListing.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';
import type { FuelType, GearboxType } from '../../../domain/entities/VehicleType.js';
import { parseVehicleType } from '../../../domain/entities/VehicleType.js';

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
    displacement_cc   INTEGER,
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
    previous_price_mad REAL,
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (source_id, external_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listings_good_deal_created
     ON listings (is_good_deal, created_at)`,
  // Ledger of every external id we've crawled per source, matched or not.
  // Distinct from `listings` (catalog matches only): a date-less source (Biker)
  // uses this to stop paginating once it reaches an already-crawled page.
  `CREATE TABLE IF NOT EXISTS crawled_listings (
    source_id   TEXT NOT NULL,
    external_id TEXT NOT NULL,
    crawled_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (source_id, external_id)
  )`,
  // Admin review queue: listings that name a brand we know but no model we have,
  // so they're dropped by discovery instead of shown to users. An admin adds the
  // model to the catalog (or picks an existing one) and promotes the row into
  // `listings`. `status`: 'pending' | 'dismissed' (promoted rows are deleted).
  `CREATE TABLE IF NOT EXISTS review_listings (
    source_id       TEXT    NOT NULL,
    external_id     TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    title           TEXT    NOT NULL,
    price_mad       REAL    NOT NULL,
    year            INTEGER,
    mileage_km      INTEGER,
    displacement_cc INTEGER,
    city            TEXT    NOT NULL,
    image_url       TEXT,
    posted_at       TEXT,
    detected_brand  TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending',
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT,
    PRIMARY KEY (source_id, external_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_listings_status ON review_listings (status, created_at)`,
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
    auto_calibrate INTEGER NOT NULL DEFAULT 1,
    calibrated_at      TEXT,
    calibrated_samples INTEGER,
    -- Set when the scanner auto-discovered this model from a listing title;
    -- null for models an admin or an approved request created. Lets a bad
    -- fuzzy match be found and removed after the fact.
    discovered_at      TEXT,
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
  `CREATE INDEX IF NOT EXISTS idx_listings_model_scraped ON listings (matched_model_id, scraped_at)`,
  // Per-user budget/year window, keyed by vehicle type so moto and car
  // budgets stay independent. Existing `user_search_ranges` rows are copied
  // into this table as motorcycle on migrate (see Database.applyMigrations).
  `CREATE TABLE IF NOT EXISTS user_vehicle_search_ranges (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type TEXT NOT NULL DEFAULT 'motorcycle',
    budget_min   INTEGER NOT NULL,
    budget_max   INTEGER NOT NULL,
    year_min     INTEGER NOT NULL,
    year_max     INTEGER NOT NULL,
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, vehicle_type)
  )`,
  // Models a user has chosen to follow (picked at onboarding, edited on profile).
  `CREATE TABLE IF NOT EXISTS user_watched_models (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    PRIMARY KEY (user_id, model_id)
  )`,
  // Presence of a row means the user has completed onboarding (even if they
  // picked no models). A separate table avoids a non-idempotent ALTER on users.
  `CREATE TABLE IF NOT EXISTS user_onboarding (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    onboarded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  // Per-user alerts (watched-model new deals, price drops). One row feeds both
  // the in-app bell (read_at) and the email digest (emailed_at). The unique
  // index is the "already alerted" guard: inserts use ON CONFLICT DO NOTHING.
  `CREATE TABLE IF NOT EXISTS notifications (
    id            TEXT PRIMARY KEY,
    user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          TEXT    NOT NULL,
    source_id     TEXT    NOT NULL,
    external_id   TEXT    NOT NULL,
    model_id      TEXT,
    price_mad     INTEGER,
    old_price_mad INTEGER,
    url           TEXT    NOT NULL,
    image_url     TEXT,
    title         TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    read_at       TEXT,
    emailed_at    TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
     ON notifications (user_id, type, source_id, external_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_created
     ON notifications (user_id, created_at)`,
  // Price observations for a listing (insert + each later drop) so the card
  // can show this ad's own path once more than one scrape exists.
  `CREATE TABLE IF NOT EXISTS listing_price_events (
    source_id   TEXT NOT NULL,
    external_id TEXT NOT NULL,
    observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    price_mad   REAL NOT NULL,
    PRIMARY KEY (source_id, external_id, observed_at)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listing_price_events_listing
     ON listing_price_events (source_id, external_id, observed_at)`,
  // Named filter snapshots that drive the "Your searches" tab and alerts.
  `CREATE TABLE IF NOT EXISTS user_saved_searches (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    budget_min   INTEGER NOT NULL,
    budget_max   INTEGER NOT NULL,
    year_min     INTEGER NOT NULL,
    year_max     INTEGER NOT NULL,
    mileage_max  INTEGER NOT NULL DEFAULT 0,
    brands       TEXT NOT NULL DEFAULT '[]',
    cities       TEXT NOT NULL DEFAULT '[]',
    fuel_types   TEXT NOT NULL DEFAULT '[]',
    gearboxes    TEXT NOT NULL DEFAULT '[]',
    model_ids    TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_saved_searches_user
     ON user_saved_searches (user_id, vehicle_type)`,
  // Individual listings a user bookmarked. Keyed by the listing's (source,
  // external) id so it survives re-scrapes; price-drop alerts also target these.
  `CREATE TABLE IF NOT EXISTS user_saved_listings (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id   TEXT NOT NULL,
    external_id TEXT NOT NULL,
    saved_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, source_id, external_id)
  )`,
];

/**
 * Columns added to existing tables after they first shipped. `ALTER TABLE
 * ADD COLUMN` isn't idempotent, so {@link ensureColumns} only runs the ones
 * a database is actually missing. New databases get them via CREATE above;
 * this backfills already-deployed ones (e.g. Turso).
 */
export const ADDITIVE_COLUMNS: ReadonlyArray<{
  table: string;
  column: string;
  definition: string;
}> = [
  { table: 'models', column: 'auto_calibrate', definition: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'models', column: 'calibrated_at', definition: 'TEXT' },
  { table: 'models', column: 'calibrated_samples', definition: 'INTEGER' },
  { table: 'models', column: 'discovered_at', definition: 'TEXT' },
  { table: 'listings', column: 'previous_price_mad', definition: 'REAL' },
  { table: 'listings', column: 'displacement_cc', definition: 'INTEGER' },
  { table: 'listings', column: 'vehicle_type', definition: "TEXT NOT NULL DEFAULT 'motorcycle'" },
  { table: 'listings', column: 'fuel_type', definition: 'TEXT' },
  { table: 'listings', column: 'gearbox', definition: 'TEXT' },
  { table: 'models', column: 'vehicle_type', definition: "TEXT NOT NULL DEFAULT 'motorcycle'" },
  { table: 'model_requests', column: 'vehicle_type', definition: "TEXT NOT NULL DEFAULT 'motorcycle'" },
  { table: 'review_listings', column: 'vehicle_type', definition: "TEXT NOT NULL DEFAULT 'motorcycle'" },
  { table: 'review_listings', column: 'fuel_type', definition: 'TEXT' },
  { table: 'review_listings', column: 'gearbox', definition: 'TEXT' },
  { table: 'listings', column: 'first_owner', definition: 'INTEGER' },
  { table: 'listings', column: 'ww', definition: 'INTEGER' },
  { table: 'listings', column: 'accidented', definition: 'INTEGER' },
  { table: 'listings', column: 'customs_cleared', definition: 'INTEGER' },
  { table: 'users', column: 'phone', definition: 'TEXT' },
  { table: 'users', column: 'whatsapp_opt_in', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'notifications', column: 'whatsapped_at', definition: 'TEXT' },
];

/**
 * Indexes that depend on additive columns. Must run after {@link ensureColumns}
 * so a fresh database (CREATE TABLE without those columns) doesn't fail.
 */
export const POST_COLUMN_INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_listings_vehicle_type_scraped ON listings (vehicle_type, scraped_at)`,
  `CREATE INDEX IF NOT EXISTS idx_models_vehicle_type ON models (vehicle_type)`,
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
  'displacement_cc',
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
  'vehicle_type',
  'fuel_type',
  'gearbox',
  'first_owner',
  'ww',
  'accidented',
  'customs_cleared',
] as const;

function boolFlag(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function readBoolFlag(value: number | null | undefined): boolean | undefined {
  if (value == null) return undefined;
  return Number(value) === 1;
}

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
    listing.displacementCc ?? null,
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
    listing.vehicleType,
    listing.fuelType ?? null,
    listing.gearbox ?? null,
    boolFlag(listing.firstOwner),
    boolFlag(listing.ww),
    boolFlag(listing.accidented),
    boolFlag(listing.customsCleared),
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
  displacement_cc: number | null;
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
  created_at: string;
  vehicle_type: string | null;
  fuel_type: string | null;
  gearbox: string | null;
  first_owner: number | null;
  ww: number | null;
  accidented: number | null;
  customs_cleared: number | null;
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
    displacementCc: row.displacement_cc ?? undefined,
    vehicleType: parseVehicleType(row.vehicle_type),
    fuelType: (row.fuel_type as FuelType | null) ?? undefined,
    gearbox: (row.gearbox as GearboxType | null) ?? undefined,
    firstOwner: readBoolFlag(row.first_owner),
    ww: readBoolFlag(row.ww),
    accidented: readBoolFlag(row.accidented),
    customsCleared: readBoolFlag(row.customs_cleared),
    city: row.city,
    imageUrl: row.image_url ?? undefined,
    postedAt: row.posted_at ? new Date(row.posted_at) : undefined,
    scrapedAt: new Date(row.scraped_at),
    firstSeenAt: row.created_at,
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
