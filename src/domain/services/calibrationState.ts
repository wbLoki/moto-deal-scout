import type { ModelCriteria } from '../entities/SearchCriteria.js';

/**
 * Whether the market has told us what this model is actually worth yet.
 *
 * A model starts at {@link PROVISIONAL_PRICE_RANGE} (`min: 0`) and stays
 * there until {@link computeFairRange} has enough recent listings to derive a
 * p25–p75 band. Because that function rounds bounds up to at least its 500
 * MAD step, a calibrated model can never have `min: 0` — so this check needs
 * no extra column and clears itself the moment calibration succeeds.
 */
export function isCalibrated(model: Pick<ModelCriteria, 'priceRangeMAD'>): boolean {
  return model.priceRangeMAD.min > 0;
}
