import type { ModelCriteria } from './SearchCriteria.js';

/** A tracked model as stored/managed by the admin: scan criteria plus admin controls. */
export interface StoredModel extends ModelCriteria {
  readonly enabled: boolean;
  /** When true, the price range is recomputed from market data on each scan. */
  readonly autoCalibrate: boolean;
  /** ISO timestamp of the last auto-calibration, if any. */
  readonly calibratedAt?: string | undefined;
  /** How many listings informed the last auto-calibration. */
  readonly calibratedSamples?: number | undefined;
}
