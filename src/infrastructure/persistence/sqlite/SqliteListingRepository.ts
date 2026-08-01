import type BetterSqlite3 from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Listing, MarketplaceId } from '../../../domain/entities/Listing.js';
import type { ScoredListing } from '../../../domain/entities/ScoredListing.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';
import type { ListingRepository } from '../../../domain/interfaces/ListingRepository.js';

interface ListingRow {
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

const UPSERT_SQL = `
  INSERT INTO listings (
    source_id, external_id, url, title, description, price_mad, year, mileage_km, city,
    image_url, posted_at, scraped_at, matched_model_id, match_confidence,
    score_price, score_mileage, score_year, score_city, score_total, score_reasons, is_good_deal
  ) VALUES (
    @source_id, @external_id, @url, @title, @description, @price_mad, @year, @mileage_km, @city,
    @image_url, @posted_at, @scraped_at, @matched_model_id, @match_confidence,
    @score_price, @score_mileage, @score_year, @score_city, @score_total, @score_reasons, @is_good_deal
  )
  ON CONFLICT (source_id, external_id) DO UPDATE SET
    url = excluded.url,
    title = excluded.title,
    description = excluded.description,
    price_mad = excluded.price_mad,
    year = excluded.year,
    mileage_km = excluded.mileage_km,
    city = excluded.city,
    image_url = excluded.image_url,
    posted_at = excluded.posted_at,
    scraped_at = excluded.scraped_at,
    matched_model_id = excluded.matched_model_id,
    match_confidence = excluded.match_confidence,
    score_price = excluded.score_price,
    score_mileage = excluded.score_mileage,
    score_year = excluded.score_year,
    score_city = excluded.score_city,
    score_total = excluded.score_total,
    score_reasons = excluded.score_reasons,
    is_good_deal = excluded.is_good_deal
`;

/**
 * SQLite-backed {@link ListingRepository}. `models` must be the currently
 * loaded search criteria's model list — it's used to resolve
 * `matched_model_id` back into a full `ModelCriteria` when reading rows
 * (only the id is persisted, since the rest is config, not data).
 */
export class SqliteListingRepository implements ListingRepository {
  private readonly modelsById: ReadonlyMap<string, ModelCriteria>;

  constructor(
    private readonly db: BetterSqlite3.Database,
    models: readonly ModelCriteria[],
    private readonly logger?: Logger,
  ) {
    this.modelsById = new Map(models.map((m) => [m.id, m]));
  }

  hasSeen(sourceId: MarketplaceId, externalId: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM listings WHERE source_id = ? AND external_id = ? LIMIT 1')
      .get(sourceId, externalId);
    return Promise.resolve(row !== undefined);
  }

  save(scored: ScoredListing): Promise<void> {
    const { listing, match, score } = scored;
    this.db.prepare(UPSERT_SQL).run({
      source_id: listing.sourceId,
      external_id: listing.externalId,
      url: listing.url,
      title: listing.title,
      description: listing.description ?? null,
      price_mad: listing.priceMAD,
      year: listing.year ?? null,
      mileage_km: listing.mileageKm ?? null,
      city: listing.city,
      image_url: listing.imageUrl ?? null,
      posted_at: listing.postedAt?.toISOString() ?? null,
      scraped_at: listing.scrapedAt.toISOString(),
      matched_model_id: match.criteria.id,
      match_confidence: match.confidence,
      score_price: score.price,
      score_mileage: score.mileage,
      score_year: score.year,
      score_city: score.city,
      score_total: score.total,
      score_reasons: JSON.stringify(score.reasons),
      is_good_deal: scored.isGoodDeal ? 1 : 0,
    });
    return Promise.resolve();
  }

  getGoodDealsSince(sinceDate: Date): Promise<ScoredListing[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM listings WHERE is_good_deal = 1 AND created_at >= ? ORDER BY created_at DESC`,
      )
      .all(sinceDate.toISOString()) as ListingRow[];

    const results: ScoredListing[] = [];
    for (const row of rows) {
      const scored = this.rowToScoredListing(row);
      if (scored) results.push(scored);
    }
    return Promise.resolve(results);
  }

  close(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }

  private rowToScoredListing(row: ListingRow): ScoredListing | undefined {
    const criteria = this.modelsById.get(row.matched_model_id);
    if (!criteria) {
      this.logger?.warn(
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
}
