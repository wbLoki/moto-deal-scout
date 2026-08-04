import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { computeFairRange } from './domain/services/fairRange.js';
import { priceIsPlausible } from './domain/services/priceFilter.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlListingRepository } from './infrastructure/persistence/libsql/LibsqlListingRepository.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';

/** Only listings seen within this window inform a model's current fair value. */
export const CALIBRATION_WINDOW_DAYS = 90;

export interface CalibrationResult {
  /** Models whose price range was recomputed from market data. */
  readonly calibrated: number;
  /** Auto-calibrate models with too little recent data (kept their existing range). */
  readonly skipped: number;
}

/**
 * Recomputes each auto-calibrate model's fair price range from recent market
 * prices (the p25–p75 band). Models with too few recent listings are left as
 * they are, and models with auto-calibrate turned off are never touched — the
 * admin's manual range stands. Idempotent; safe to run before every scan.
 */
export async function calibrateModels(): Promise<CalibrationResult> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabaseFromEnv();
  try {
    const modelRepo = new LibsqlModelRepository(db);
    await modelRepo.seedIfEmpty(config.models);
    const models = (await modelRepo.listAll()).filter((m) => m.autoCalibrate);

    const listings = new LibsqlListingRepository(db, []);
    const seenSince = new Date(Date.now() - CALIBRATION_WINDOW_DAYS * 86_400_000);

    let calibrated = 0;
    let skipped = 0;
    for (const model of models) {
      const prices = (await listings.getPricesForModel(model.id, seenSince)).filter((p) =>
        priceIsPlausible(p, model.priceRangeMAD.min, config.global.minPriceFactor),
      );
      const range = computeFairRange(prices);
      if (range) {
        await modelRepo.applyCalibration(model.id, range.min, range.max, range.samples);
        calibrated += 1;
      } else {
        skipped += 1;
      }
    }
    return { calibrated, skipped };
  } finally {
    db.close();
  }
}
