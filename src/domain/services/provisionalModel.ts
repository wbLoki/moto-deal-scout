import type { StoredModel } from '../entities/Model.js';
import type { VehicleType } from '../entities/VehicleType.js';

/**
 * The id for a brand/model pair. Every path that can create a model — the
 * discovery crawl, an approved user request, an admin edit — must derive ids
 * the same way, or the same bike ends up stored twice under different ids.
 *
 * Accents are stripped *before* punctuation is collapsed, so "Ténéré 700"
 * becomes `tenere-700`. Doing it the other way round treats each accented
 * letter as a separator and yields `t-n-r-700`.
 */
export function modelId(brand: string, model: string): string {
  return `${brand}-${model}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The price range a model starts with before the market has told us what it's
 * actually worth. `min: 0` is the "no fair value known yet" sentinel: it can
 * never be produced by {@link computeFairRange} (which rounds up to at least
 * its 500 MAD step), so it unambiguously means "not calibrated", and the
 * first successful calibration clears it on its own.
 */
export const PROVISIONAL_PRICE_RANGE = { min: 0, max: 300_000 } as const;

/** Mileage/year defaults for a model nobody has tuned yet. Deliberately wide. */
export const PROVISIONAL_MAX_MILEAGE_KM = 60_000;
export const PROVISIONAL_MIN_YEAR = 2010;
export const PROVISIONAL_CAR_MAX_MILEAGE_KM = 200_000;
export const PROVISIONAL_CAR_MIN_YEAR = 2008;
export const PROVISIONAL_CAR_PRICE_RANGE = { min: 0, max: 800_000 } as const;

/**
 * Builds the row for a model we've just learned exists — whether the scanner
 * discovered it in a listing title or an admin approved a user's request.
 * Both paths share this so their starting criteria can't drift apart.
 */
export function provisionalModel(input: {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly aliases?: readonly string[];
  readonly vehicleType?: VehicleType;
}): StoredModel {
  const vehicleType = input.vehicleType ?? 'motorcycle';
  const isCar = vehicleType === 'car';
  return {
    id: input.id,
    brand: input.brand,
    model: input.model,
    aliases: [...(input.aliases ?? [])],
    priceRangeMAD: { ...(isCar ? PROVISIONAL_CAR_PRICE_RANGE : PROVISIONAL_PRICE_RANGE) },
    maxMileageKm: isCar ? PROVISIONAL_CAR_MAX_MILEAGE_KM : PROVISIONAL_MAX_MILEAGE_KM,
    minYear: isCar ? PROVISIONAL_CAR_MIN_YEAR : PROVISIONAL_MIN_YEAR,
    vehicleType,
    enabled: true,
    autoCalibrate: true,
  };
}
