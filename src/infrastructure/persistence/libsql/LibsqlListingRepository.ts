import type { Client, InValue, Row } from '@libsql/client';
import type { Logger } from 'pino';
import type { SortKey } from '../../../domain/entities/DealSort.js';
import type { MarketplaceId } from '../../../domain/entities/Listing.js';
import type { ScoredListing } from '../../../domain/entities/ScoredListing.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';
import type {
  DealFacets,
  DealQuery,
  DealTab,
  ListingRepository,
  TabCounts,
} from '../../../domain/interfaces/ListingRepository.js';
import { tierScoreBand } from '../../../domain/services/dealTier.js';
import { mapRowToScoredListing, toInsertArgs, UPSERT_SQL, type ListingRow } from './schema.js';

/**
 * SQL ORDER BY fragment per sort key. A stable id tiebreaker is appended by
 * callers. The date sorts key off the marketplace's own publish date when we
 * have it, falling back to first-seen (`created_at`) for listings whose source
 * doesn't expose one — so "Newest" means newest *ad*, not newest to our crawler.
 */
const DATE_EXPR = 'COALESCE(l.posted_at, l.created_at)';
const ORDER_BY: Record<SortKey, string> = {
  newest: `${DATE_EXPR} DESC`,
  oldest: `${DATE_EXPR} ASC`,
  'price-asc': 'l.price_mad ASC',
  'price-desc': 'l.price_mad DESC',
  score: 'l.score_total DESC',
};

const placeholders = (n: number): string => Array(n).fill('?').join(', ');

/** Escapes LIKE wildcards so a user's `%`/`_` are matched literally (with ESCAPE '\'). */
const likeContains = (term: string): string => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The FROM/JOIN + WHERE of a deal query, with join args and where args kept separate. */
interface QueryParts {
  readonly joins: string;
  readonly joinArgs: InValue[];
  readonly where: string;
  readonly whereArgs: InValue[];
}

/**
 * Builds the shared FROM/JOIN + WHERE for the dashboard feed. `tab` may differ
 * from `q.tab` (the tab-count queries reuse this for each tab). `applyRange`
 * and `applyFilters` let counts/facets omit the budget window or the
 * search/mileage/rating/city/brand filters. Positional args are returned split
 * because the saved-tab JOIN carries a `?` that must precede the WHERE args.
 */
function buildParts(
  q: DealQuery,
  opts: { tab: DealTab; applyRange: boolean; applyFilters: boolean },
): QueryParts {
  const joinArgs: InValue[] = [];
  const conds: string[] = [];
  const whereArgs: InValue[] = [];
  let joins = 'JOIN models m ON m.id = l.matched_model_id';

  // Saved bookmarks join in (and deliberately ignore the budget/year range).
  if (opts.tab === 'saved') {
    joins +=
      ' JOIN user_saved_listings sv ON sv.source_id = l.source_id' +
      ' AND sv.external_id = l.external_id AND sv.user_id = ?';
    joinArgs.push(q.userId);
  }

  // Hide implausibly-cheap listings (price below the model's floor × factor).
  // A provisional model has price_min = 0, so its threshold is 0 — always passes.
  conds.push('l.price_mad >= m.price_min * ?');
  whereArgs.push(q.minPriceFactor);

  if (opts.applyRange) {
    conds.push('l.price_mad BETWEEN ? AND ?');
    whereArgs.push(q.range.budgetMin, q.range.budgetMax);
    conds.push('(l.year IS NULL OR l.year BETWEEN ? AND ?)');
    whereArgs.push(q.range.yearMin, q.range.yearMax);
  }

  if (opts.tab === 'daily') {
    conds.push('l.created_at >= ?');
    whereArgs.push(q.startOfToday);
  } else if (opts.tab === 'watched') {
    // Caller guarantees a non-empty set (an empty watchlist short-circuits to 0).
    conds.push(`l.matched_model_id IN (${placeholders(q.watchedModelIds.length)})`);
    whereArgs.push(...q.watchedModelIds);
  }

  if (opts.applyFilters) {
    const search = q.search.trim().toLowerCase();
    if (search) {
      conds.push("LOWER(m.brand || ' ' || m.model || ' ' || l.city) LIKE ? ESCAPE '\\'");
      whereArgs.push(likeContains(search));
    }

    if (q.mileageMin > 0 || q.mileageMax > 0) {
      const max = q.mileageMax > 0 ? q.mileageMax : Number.MAX_SAFE_INTEGER;
      conds.push('(l.mileage_km IS NULL OR l.mileage_km BETWEEN ? AND ?)');
      whereArgs.push(q.mileageMin, max);
    }

    if (q.ccMin > 0 || q.ccMax > 0) {
      const max = q.ccMax > 0 ? q.ccMax : Number.MAX_SAFE_INTEGER;
      conds.push('(l.displacement_cc IS NULL OR l.displacement_cc BETWEEN ? AND ?)');
      whereArgs.push(q.ccMin, max);
    }

    if (q.cities.length > 0) {
      conds.push(`LOWER(l.city) IN (${placeholders(q.cities.length)})`);
      whereArgs.push(...q.cities.map((c) => c.toLowerCase()));
    }

    if (q.brands.length > 0) {
      conds.push(`LOWER(m.brand) IN (${placeholders(q.brands.length)})`);
      whereArgs.push(...q.brands.map((b) => b.toLowerCase()));
    }

    if (q.ratings.length > 0) {
      const ors: string[] = [];
      for (const level of q.ratings) {
        if (level === 'calibrating') {
          ors.push('m.price_min = 0');
          continue;
        }
        const band = tierScoreBand(level);
        if (!band) continue;
        if (band.maxExclusive === Infinity) {
          ors.push('(m.price_min > 0 AND l.score_total >= ?)');
          whereArgs.push(band.min);
        } else {
          ors.push('(m.price_min > 0 AND l.score_total >= ? AND l.score_total < ?)');
          whereArgs.push(band.min, band.maxExclusive);
        }
      }
      if (ors.length > 0) conds.push(`(${ors.join(' OR ')})`);
    }
  }

  return { joins, joinArgs, where: conds.join(' AND '), whereArgs };
}

/**
 * libsql-backed {@link ListingRepository}. Works unchanged against a local
 * SQLite file (CLI, tests) or a remote Turso database (Vercel) — the
 * difference lives entirely in how the {@link Client} was created.
 *
 * `models` must be the currently-loaded criteria's model list; it resolves
 * the persisted `matched_model_id` back into a full `ModelCriteria` on read.
 */
export class LibsqlListingRepository implements ListingRepository {
  private readonly modelsById: ReadonlyMap<string, ModelCriteria>;

  constructor(
    private readonly client: Client,
    models: readonly ModelCriteria[],
    private readonly logger?: Logger,
  ) {
    this.modelsById = new Map(models.map((m) => [m.id, m]));
  }

  async hasSeen(sourceId: MarketplaceId, externalId: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: 'SELECT 1 FROM listings WHERE source_id = ? AND external_id = ? LIMIT 1',
      args: [sourceId, externalId],
    });
    return result.rows.length > 0;
  }

  async crawledExternalIds(sourceId: MarketplaceId): Promise<Set<string>> {
    const result = await this.client.execute({
      sql: 'SELECT external_id FROM crawled_listings WHERE source_id = ?',
      args: [sourceId],
    });
    return new Set(
      (result.rows as unknown as { external_id: string }[]).map((r) => r.external_id),
    );
  }

  async recordCrawled(sourceId: MarketplaceId, externalIds: readonly string[]): Promise<void> {
    if (externalIds.length === 0) return;
    // De-dupe first so one batch can't insert the same PK twice.
    const unique = [...new Set(externalIds)];
    await this.client.batch(
      unique.map((externalId) => ({
        sql: `INSERT INTO crawled_listings (source_id, external_id) VALUES (?, ?)
              ON CONFLICT (source_id, external_id)
              DO UPDATE SET crawled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        args: [sourceId, externalId],
      })),
      'write',
    );
  }

  async lastScrapedAt(sourceId: MarketplaceId): Promise<Date | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT MAX(scraped_at) AS last FROM listings WHERE source_id = ?',
      args: [sourceId],
    });
    const last = (result.rows[0] as unknown as { last: string | null } | undefined)?.last;
    return last ? new Date(last) : undefined;
  }

  async save(scored: ScoredListing): Promise<void> {
    await this.client.execute({ sql: UPSERT_SQL, args: toInsertArgs(scored) });
  }

  async getGoodDealsSince(sinceDate: Date): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings WHERE is_good_deal = 1 AND created_at >= ? ORDER BY created_at DESC',
      args: [sinceDate.toISOString()],
    });
    return this.mapRows(result.rows);
  }

  async getRecentGoodDeals(limit: number): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings WHERE is_good_deal = 1 ORDER BY created_at DESC LIMIT ?',
      args: [limit],
    });
    return this.mapRows(result.rows);
  }

  async getRecentListings(limit: number): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings ORDER BY created_at DESC LIMIT ?',
      args: [limit],
    });
    return this.mapRows(result.rows);
  }

  async getTopScoredListings(limit: number): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings ORDER BY score_total DESC, created_at DESC LIMIT ?',
      args: [limit],
    });
    return this.mapRows(result.rows);
  }

  async queryDeals(q: DealQuery): Promise<{ deals: ScoredListing[]; total: number }> {
    // An empty watchlist can't match anything; skip the round-trip entirely.
    if (q.tab === 'watched' && q.watchedModelIds.length === 0) return { deals: [], total: 0 };

    const parts = buildParts(q, {
      tab: q.tab,
      applyRange: q.tab !== 'saved',
      applyFilters: true,
    });
    const where = parts.where ? `WHERE ${parts.where}` : '';
    const orderBy = `${ORDER_BY[q.sort]}, l.source_id, l.external_id`;
    const offset = Math.max(0, (q.page - 1) * q.pageSize);

    const [rowsRes, countRes] = await Promise.all([
      this.client.execute({
        sql: `SELECT l.* FROM listings l ${parts.joins} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        args: [...parts.joinArgs, ...parts.whereArgs, q.pageSize, offset],
      }),
      this.client.execute({
        sql: `SELECT COUNT(*) AS n FROM listings l ${parts.joins} ${where}`,
        args: [...parts.joinArgs, ...parts.whereArgs],
      }),
    ]);

    return {
      deals: this.mapRows(rowsRes.rows),
      total: Number((countRes.rows[0] as unknown as { n: number }).n),
    };
  }

  async countDealsByTab(q: DealQuery): Promise<TabCounts> {
    const countFor = async (tab: DealTab): Promise<number> => {
      if (tab === 'watched' && q.watchedModelIds.length === 0) return 0;
      const parts = buildParts(q, { tab, applyRange: tab !== 'saved', applyFilters: false });
      const where = parts.where ? `WHERE ${parts.where}` : '';
      const res = await this.client.execute({
        sql: `SELECT COUNT(*) AS n FROM listings l ${parts.joins} ${where}`,
        args: [...parts.joinArgs, ...parts.whereArgs],
      });
      return Number((res.rows[0] as unknown as { n: number }).n);
    };

    const [all, daily, watched, saved] = await Promise.all([
      countFor('all'),
      countFor('daily'),
      countFor('watched'),
      countFor('saved'),
    ]);
    return { all, daily, watched, saved };
  }

  async getDealFacets(q: DealQuery): Promise<DealFacets> {
    // Filter options come from the whole in-range set, not one page or tab.
    // Aggregate in SQL — pulling every listing row over Turso was a major TTFB cost.
    const parts = buildParts(q, { tab: 'all', applyRange: true, applyFilters: false });
    const from = `FROM listings l ${parts.joins}`;
    const args = [...parts.joinArgs, ...parts.whereArgs];
    const withPred = (extra: string): string =>
      parts.where ? `WHERE ${parts.where} AND ${extra}` : `WHERE ${extra}`;

    const [brandsRes, citiesRes, maxRes] = await Promise.all([
      this.client.execute({
        sql: `SELECT DISTINCT TRIM(m.brand) AS brand ${from}
              ${withPred(`TRIM(m.brand) != ''`)}
              ORDER BY brand COLLATE NOCASE`,
        args,
      }),
      this.client.execute({
        sql: `SELECT DISTINCT TRIM(l.city) AS city ${from}
              ${withPred(`TRIM(l.city) != ''`)}
              ORDER BY city COLLATE NOCASE`,
        args,
      }),
      this.client.execute({
        sql: `SELECT MAX(l.mileage_km) AS maxMileage,
                     MAX(l.displacement_cc) AS maxCc,
                     MAX(l.price_mad) AS maxPrice
              ${from}${parts.where ? ` WHERE ${parts.where}` : ''}`,
        args,
      }),
    ]);

    const brandByKey = new Map<string, string>();
    for (const row of brandsRes.rows as unknown as { brand: string }[]) {
      const brand = row.brand?.trim();
      if (brand) brandByKey.set(brand.toLowerCase(), brand);
    }
    const cityByKey = new Map<string, string>();
    for (const row of citiesRes.rows as unknown as { city: string }[]) {
      const city = row.city?.trim();
      if (city) cityByKey.set(city.toLowerCase(), city);
    }
    const maxRow = maxRes.rows[0] as unknown as {
      maxMileage: number | null;
      maxCc: number | null;
      maxPrice: number | null;
    };
    const sorted = (m: Map<string, string>): string[] =>
      [...m.values()].sort((a, b) => a.localeCompare(b));
    return {
      brands: sorted(brandByKey),
      cities: sorted(cityByKey),
      maxMileage: Number(maxRow?.maxMileage ?? 0),
      maxCc: Number(maxRow?.maxCc ?? 0),
      maxPrice: Number(maxRow?.maxPrice ?? 0),
    };
  }

  async getListingsSince(sinceDate: Date): Promise<ScoredListing[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings WHERE created_at >= ? ORDER BY created_at DESC',
      args: [sinceDate.toISOString()],
    });
    return this.mapRows(result.rows);
  }

  async getPricesForModel(modelId: string, seenSince: Date): Promise<number[]> {
    const result = await this.client.execute({
      sql: 'SELECT price_mad FROM listings WHERE matched_model_id = ? AND scraped_at >= ?',
      args: [modelId, seenSince.toISOString()],
    });
    return (result.rows as unknown as { price_mad: number }[]).map((r) => Number(r.price_mad));
  }

  async getStoredPrice(sourceId: MarketplaceId, externalId: string): Promise<number | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT price_mad FROM listings WHERE source_id = ? AND external_id = ?',
      args: [sourceId, externalId],
    });
    const row = result.rows[0] as unknown as { price_mad: number } | undefined;
    return row ? Number(row.price_mad) : undefined;
  }

  async findBySourceExternalId(
    sourceId: MarketplaceId,
    externalId: string,
  ): Promise<ScoredListing | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM listings WHERE source_id = ? AND external_id = ? LIMIT 1',
      args: [sourceId, externalId],
    });
    const row = result.rows[0];
    if (!row) return undefined;
    return mapRowToScoredListing(row as unknown as ListingRow, this.modelsById, this.logger);
  }

  async recordPriceDrop(
    sourceId: MarketplaceId,
    externalId: string,
    newPriceMAD: number,
    oldPriceMAD: number,
  ): Promise<void> {
    await this.client.execute({
      sql: `UPDATE listings
            SET price_mad = ?, previous_price_mad = ?, scraped_at = ?
            WHERE source_id = ? AND external_id = ?`,
      args: [newPriceMAD, oldPriceMAD, new Date().toISOString(), sourceId, externalId],
    });
  }

  async refreshMissingImage(
    sourceId: MarketplaceId,
    externalId: string,
    imageUrl: string,
  ): Promise<void> {
    await this.client.execute({
      sql: `UPDATE listings
            SET image_url = ?
            WHERE source_id = ? AND external_id = ?
              AND (
                image_url IS NULL
                OR image_url = ''
                OR image_url LIKE '%phoenix-assets%'
                OR image_url LIKE '%avatar.svg%'
              )`,
      args: [imageUrl, sourceId, externalId],
    });
  }

  async listImageGaps(
    sourceId: MarketplaceId,
  ): Promise<readonly { readonly externalId: string; readonly url: string }[]> {
    const result = await this.client.execute({
      sql: `SELECT external_id, url FROM listings
            WHERE source_id = ?
              AND (
                image_url IS NULL
                OR image_url = ''
                OR image_url LIKE '%phoenix-assets%'
                OR image_url LIKE '%avatar.svg%'
              )
            ORDER BY created_at DESC`,
      args: [sourceId],
    });
    return result.rows.map((row) => ({
      externalId: String(row.external_id),
      url: String(row.url),
    }));
  }

  close(): Promise<void> {
    this.client.close();
    return Promise.resolve();
  }

  private mapRows(rows: readonly Row[]): ScoredListing[] {
    const results: ScoredListing[] = [];
    for (const row of rows) {
      const scored = mapRowToScoredListing(
        row as unknown as ListingRow,
        this.modelsById,
        this.logger,
      );
      if (scored) results.push(scored);
    }
    return results;
  }
}
