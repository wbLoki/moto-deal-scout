import { reviewRange, type RangeReview } from './application/services/aiPriceReviewer.js';
import { isCalibrated } from './domain/services/calibrationState.js';
import { createAiExtractor } from './infrastructure/ai/aiExtractor.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';

/**
 * Models reviewed per click — bounded to fit the 60s function limit and to stay
 * under free-tier per-minute request caps (Gemini free is ~10-15 RPM).
 */
const BATCH = 10;
/** How many AI calls run at once. Kept low so a free tier isn't rate-limited. */
const CONCURRENCY = 2;

export interface RangeReviewRow {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly min: number;
  readonly max: number;
  readonly review: RangeReview;
}

export interface RangeReviewPage {
  readonly rows: readonly RangeReviewRow[];
  /** Total calibrated models across all batches. */
  readonly total: number;
  /** How many have been reviewed through this batch. */
  readonly reviewed: number;
  /** Offset for the next batch, or null when done. */
  readonly nextOffset: number | null;
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Reviews one bounded batch of calibrated fair ranges with Claude, starting at
 * `offset` (ordered by id for stable paging). Throws `AiUnavailableError` when
 * no API key is set (the action maps it to a friendly message).
 */
export async function reviewCalibratedRanges(offset = 0): Promise<RangeReviewPage> {
  const ai = createAiExtractor();
  const db = await openDatabaseFromEnv();
  try {
    const calibrated = (await new LibsqlModelRepository(db).listEnabledCriteria())
      .filter(isCalibrated)
      .sort((a, b) => a.id.localeCompare(b.id));

    const start = Math.max(0, offset);
    const slice = calibrated.slice(start, start + BATCH);
    const rows = await mapWithConcurrency(slice, CONCURRENCY, async (m) => ({
      id: m.id,
      brand: m.brand,
      model: m.model,
      min: m.priceRangeMAD.min,
      max: m.priceRangeMAD.max,
      review: await reviewRange(ai, m),
    }));

    const reviewedThrough = start + slice.length;
    return {
      rows,
      total: calibrated.length,
      reviewed: reviewedThrough,
      nextOffset: reviewedThrough < calibrated.length ? reviewedThrough : null,
    };
  } finally {
    db.close();
  }
}
