import type { Client } from '@libsql/client';
import { ListingScorer } from './application/services/ListingScorer.js';
import { loadEnv } from './config/env.js';
import { loadCriteria } from './config/loadCriteria.js';
import type { Listing } from './domain/entities/Listing.js';
import type { StoredModel } from './domain/entities/Model.js';
import type { VehicleType } from './domain/entities/VehicleType.js';
import { parseFuelType, parseGearbox, parseVehicleType } from './domain/entities/VehicleType.js';
import { isCalibrated } from './domain/services/calibrationState.js';
import { modelId, provisionalModel } from './domain/services/provisionalModel.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';

// ---------------------------------------------------------------------------
// Capture (called from the discovery crawl via DealScanner.reviewSink)
// ---------------------------------------------------------------------------

/**
 * Queues a dropped-but-known-brand listing for admin review. Idempotent: an
 * existing row's data is refreshed but its `status` is kept, so a previously
 * dismissed listing never silently reappears. Skips anything already stored in
 * `listings` (already visible to users).
 */
export async function saveForReview(
  client: Client,
  listing: Listing,
  detectedBrand: string,
): Promise<void> {
  const seen = await client.execute({
    sql: 'SELECT 1 FROM listings WHERE source_id = ? AND external_id = ? LIMIT 1',
    args: [listing.sourceId, listing.externalId],
  });
  if (seen.rows.length > 0) return;

  await client.execute({
    sql: `INSERT INTO review_listings
            (source_id, external_id, url, title, price_mad, year, mileage_km,
             displacement_cc, city, image_url, posted_at, detected_brand,
             vehicle_type, fuel_type, gearbox)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (source_id, external_id) DO UPDATE SET
            url = excluded.url, title = excluded.title, price_mad = excluded.price_mad,
            year = excluded.year, mileage_km = excluded.mileage_km,
            displacement_cc = excluded.displacement_cc, city = excluded.city,
            image_url = excluded.image_url, posted_at = excluded.posted_at,
            detected_brand = excluded.detected_brand,
            vehicle_type = excluded.vehicle_type, fuel_type = excluded.fuel_type,
            gearbox = excluded.gearbox,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    args: [
      listing.sourceId,
      listing.externalId,
      listing.url,
      listing.title,
      listing.priceMAD,
      listing.year ?? null,
      listing.mileageKm ?? null,
      listing.displacementCc ?? null,
      listing.city,
      listing.imageUrl ?? null,
      listing.postedAt?.toISOString() ?? null,
      detectedBrand,
      listing.vehicleType,
      listing.fuelType ?? null,
      listing.gearbox ?? null,
    ],
  });
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export interface ReviewListing {
  readonly sourceId: string;
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly priceMAD: number;
  readonly year: number | null;
  readonly mileageKm: number | null;
  readonly displacementCc: number | null;
  readonly city: string;
  readonly detectedBrand: string | null;
  readonly postedAt: string | null;
  readonly createdAt: string;
}

export interface IncompleteListing {
  readonly sourceId: string;
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly modelId: string;
  readonly priceMAD: number;
  readonly year: number | null;
  readonly mileageKm: number | null;
  readonly displacementCc: number | null;
  readonly city: string;
  readonly scrapedAt: string;
}

export interface Paged<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

interface PageParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly vehicleType?: VehicleType;
}

function pageBounds(total: number, params: PageParams, defaultSize: number) {
  const pageSize = Math.min(Math.max(params.pageSize ?? defaultSize, 1), 200);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(params.page ?? 1, 1), totalPages);
  return { pageSize, totalPages, page, offset: (page - 1) * pageSize };
}

async function count(client: Client, sql: string, args: unknown[] = []): Promise<number> {
  const r = await client.execute({ sql, args: args as never });
  return Number((r.rows[0] as unknown as { n: number } | undefined)?.n ?? 0);
}

/** Pending review queue: known-brand listings with no catalog model, newest first. */
export async function listReviewQueue(params: PageParams = {}): Promise<Paged<ReviewListing>> {
  const vehicleType = params.vehicleType ?? 'motorcycle';
  const db = await openDatabaseFromEnv();
  try {
    const total = await count(
      db,
      "SELECT COUNT(*) AS n FROM review_listings WHERE status = 'pending' AND COALESCE(vehicle_type, 'motorcycle') = ?",
      [vehicleType],
    );
    const { pageSize, totalPages, page, offset } = pageBounds(total, params, 50);
    const res = await db.execute({
      sql: `SELECT source_id, external_id, url, title, price_mad, year, mileage_km,
                   displacement_cc, city, detected_brand, posted_at, created_at
              FROM review_listings
             WHERE status = 'pending' AND COALESCE(vehicle_type, 'motorcycle') = ?
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
      args: [vehicleType, pageSize, offset],
    });
    const rows = (res.rows as unknown as ReviewRow[]).map(toReviewListing);
    return { rows, total, page, pageSize, totalPages };
  } finally {
    db.close();
  }
}

/** Stored listings missing a year, mileage, or (motos only) displacement. */
export async function listIncompleteListings(
  params: PageParams = {},
): Promise<Paged<IncompleteListing>> {
  const vehicleType = params.vehicleType ?? 'motorcycle';
  const missing =
    vehicleType === 'car'
      ? '(year IS NULL OR mileage_km IS NULL)'
      : '(year IS NULL OR mileage_km IS NULL OR displacement_cc IS NULL)';
  const where = `${missing} AND COALESCE(vehicle_type, 'motorcycle') = ?`;
  const db = await openDatabaseFromEnv();
  try {
    const total = await count(db, `SELECT COUNT(*) AS n FROM listings WHERE ${where}`, [vehicleType]);
    const { pageSize, totalPages, page, offset } = pageBounds(total, params, 50);
    const res = await db.execute({
      sql: `SELECT source_id, external_id, url, title, matched_model_id, price_mad,
                   year, mileage_km, displacement_cc, city, scraped_at
              FROM listings
             WHERE ${where}
             ORDER BY scraped_at DESC
             LIMIT ? OFFSET ?`,
      args: [vehicleType, pageSize, offset],
    });
    const rows = (res.rows as unknown as IncompleteRow[]).map((r) => ({
      sourceId: r.source_id,
      externalId: r.external_id,
      url: r.url,
      title: r.title,
      modelId: r.matched_model_id,
      priceMAD: r.price_mad,
      year: r.year,
      mileageKm: r.mileage_km,
      displacementCc: r.displacement_cc,
      city: r.city,
      scrapedAt: r.scraped_at,
    }));
    return { rows, total, page, pageSize, totalPages };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Admin writes
// ---------------------------------------------------------------------------

/** Removes a review row from the queue (not a real bike, or a duplicate). */
export async function dismissReview(sourceId: string, externalId: string): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    await db.execute({
      sql: `UPDATE review_listings
               SET status = 'dismissed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE source_id = ? AND external_id = ?`,
      args: [sourceId, externalId],
    });
  } finally {
    db.close();
  }
}

export interface PromoteInput {
  readonly sourceId: string;
  readonly externalId: string;
  /** Assign to this existing catalog model id; leave empty to create a new one. */
  readonly modelId?: string;
  /** For a brand-new model: the brand and model to add to the catalog. */
  readonly newBrand?: string;
  readonly newModel?: string;
  /** Optional field corrections filled in from the listing page. */
  readonly year?: number;
  readonly mileageKm?: number;
  readonly displacementCc?: number;
  readonly vehicleType?: string;
}

/**
 * Promotes a review row into the user-visible `listings`: resolves (or creates)
 * its catalog model, scores it, saves it, and removes it from the queue. A
 * freshly-created model starts uncalibrated, so the listing shows as
 * "Calibrating" until the next scan tunes its fair-price range.
 */
export async function promoteReview(input: PromoteInput): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    const modelRepo = new LibsqlModelRepository(db);
    const model = await resolveOrCreateModel(modelRepo, input);

    const res = await db.execute({
      sql: `SELECT source_id, external_id, url, title, price_mad, year, mileage_km,
                   displacement_cc, city, image_url, posted_at,
                   vehicle_type, fuel_type, gearbox
              FROM review_listings WHERE source_id = ? AND external_id = ?`,
      args: [input.sourceId, input.externalId],
    });
    const row = res.rows[0] as unknown as PromoteRow | undefined;
    if (!row) throw new Error('Review listing not found (already handled?).');

    const listing: Listing = {
      sourceId: row.source_id as Listing['sourceId'],
      externalId: row.external_id,
      url: row.url,
      title: row.title,
      description: undefined,
      priceMAD: row.price_mad,
      year: input.year ?? row.year ?? undefined,
      mileageKm: input.mileageKm ?? row.mileage_km ?? undefined,
      displacementCc: input.displacementCc ?? row.displacement_cc ?? undefined,
      vehicleType: parseVehicleType(row.vehicle_type),
      fuelType: parseFuelType(row.fuel_type) ?? undefined,
      gearbox: parseGearbox(row.gearbox) ?? undefined,
      city: row.city,
      imageUrl: row.image_url ?? undefined,
      postedAt: row.posted_at ? new Date(row.posted_at) : undefined,
      scrapedAt: new Date(),
    };

    const global = (await loadCriteria(loadEnv().CRITERIA_CONFIG_PATH)).global;
    const score = new ListingScorer().score(listing, model, global);
    await new LibsqlListingRepository(db, [model]).save({
      listing,
      match: { criteria: model, confidence: 1 },
      score,
      isGoodDeal: isCalibrated(model) && score.total >= global.minScoreForGoodDeal,
    });

    await db.execute({
      sql: 'DELETE FROM review_listings WHERE source_id = ? AND external_id = ?',
      args: [input.sourceId, input.externalId],
    });
  } finally {
    db.close();
  }
}

/** Fills in missing fields on an already-stored listing (from the listing page). */
export async function updateListingData(
  sourceId: string,
  externalId: string,
  fields: { year?: number; mileageKm?: number; displacementCc?: number },
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (fields.year !== undefined) {
    sets.push('year = ?');
    args.push(fields.year);
  }
  if (fields.mileageKm !== undefined) {
    sets.push('mileage_km = ?');
    args.push(fields.mileageKm);
  }
  if (fields.displacementCc !== undefined) {
    sets.push('displacement_cc = ?');
    args.push(fields.displacementCc);
  }
  if (sets.length === 0) return;

  const db = await openDatabaseFromEnv();
  try {
    await db.execute({
      sql: `UPDATE listings SET ${sets.join(', ')} WHERE source_id = ? AND external_id = ?`,
      args: [...args, sourceId, externalId] as never,
    });
  } finally {
    db.close();
  }
}

/** Catalog models the promote form offers in its "assign existing" dropdown. */
export async function listModelOptions(
  vehicleType: VehicleType = 'motorcycle',
): Promise<{ id: string; label: string }[]> {
  const db = await openDatabaseFromEnv();
  try {
    const models = await new LibsqlModelRepository(db).listAll();
    return models
      .filter((m) => m.vehicleType === vehicleType)
      .map((m) => ({ id: m.id, label: `${m.brand} ${m.model}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } finally {
    db.close();
  }
}

async function resolveOrCreateModel(
  modelRepo: LibsqlModelRepository,
  input: PromoteInput,
): Promise<StoredModel> {
  const all = await modelRepo.listAll();
  if (input.modelId) {
    const existing = all.find((m) => m.id === input.modelId);
    if (!existing) throw new Error(`Model "${input.modelId}" no longer exists.`);
    return existing;
  }
  const brand = input.newBrand?.trim();
  const model = input.newModel?.trim();
  if (!brand || !model) {
    throw new Error('Pick an existing model or provide a new brand and model.');
  }
  const id = modelId(brand, model);
  const existing = all.find((m) => m.id === id);
  if (existing) return existing;
  const created = provisionalModel({
    id,
    brand,
    model,
    vehicleType: parseVehicleType(input.vehicleType),
  });
  await modelRepo.upsert(created);
  return created;
}

interface ReviewRow {
  source_id: string;
  external_id: string;
  url: string;
  title: string;
  price_mad: number;
  year: number | null;
  mileage_km: number | null;
  displacement_cc: number | null;
  city: string;
  detected_brand: string | null;
  posted_at: string | null;
  created_at: string;
}

function toReviewListing(r: ReviewRow): ReviewListing {
  return {
    sourceId: r.source_id,
    externalId: r.external_id,
    url: r.url,
    title: r.title,
    priceMAD: r.price_mad,
    year: r.year,
    mileageKm: r.mileage_km,
    displacementCc: r.displacement_cc,
    city: r.city,
    detectedBrand: r.detected_brand,
    postedAt: r.posted_at,
    createdAt: r.created_at,
  };
}

interface IncompleteRow {
  source_id: string;
  external_id: string;
  url: string;
  title: string;
  matched_model_id: string;
  price_mad: number;
  year: number | null;
  mileage_km: number | null;
  displacement_cc: number | null;
  city: string;
  scraped_at: string;
}

interface PromoteRow {
  source_id: string;
  external_id: string;
  url: string;
  title: string;
  price_mad: number;
  year: number | null;
  mileage_km: number | null;
  displacement_cc: number | null;
  city: string;
  image_url: string | null;
  posted_at: string | null;
  vehicle_type: string | null;
  fuel_type: string | null;
  gearbox: string | null;
}
