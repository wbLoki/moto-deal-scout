/** The two vehicle markets this app tracks. Every listing, model, and feed is one of these. */
export type VehicleType = 'motorcycle' | 'car';

export const VEHICLE_TYPES = ['motorcycle', 'car'] as const;

export type FuelType = 'essence' | 'diesel' | 'hybrid' | 'electric' | 'lpg';
export const FUEL_TYPES = ['essence', 'diesel', 'hybrid', 'electric', 'lpg'] as const;

export type GearboxType = 'manual' | 'automatic';
export const GEARBOX_TYPES = ['manual', 'automatic'] as const;

export function isVehicleType(value: string): value is VehicleType {
  return value === 'motorcycle' || value === 'car';
}

/** Unknown / missing values fall back to motorcycles (the original product). */
export function parseVehicleType(value: string | null | undefined): VehicleType {
  return value === 'car' ? 'car' : 'motorcycle';
}

export function isFuelType(value: string): value is FuelType {
  return (FUEL_TYPES as readonly string[]).includes(value);
}

export function isGearboxType(value: string): value is GearboxType {
  return (GEARBOX_TYPES as readonly string[]).includes(value);
}

/**
 * Normalizes seller/marketplace fuel labels (FR/EN) onto {@link FuelType}.
 * Returns undefined when the text isn't a known fuel.
 */
export function parseFuelType(raw: string | undefined | null): FuelType | undefined {
  const t = raw?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() ?? '';
  if (!t) return undefined;
  if (/\b(electrique|electric|ev)\b/.test(t) || t === 'electrique' || t === 'electric') {
    return 'electric';
  }
  if (/\b(hybride|hybrid)\b/.test(t) || t === 'hybride' || t === 'hybrid') return 'hybrid';
  if (/\b(gpl|lpg|gplc)\b/.test(t) || t === 'gpl' || t === 'lpg') return 'lpg';
  if (/\b(diesel|gazole)\b/.test(t) || t === 'diesel' || t === 'gazole') return 'diesel';
  if (/\b(essence|gasoline|petrol|sans plomb)\b/.test(t) || t === 'essence') return 'essence';
  return undefined;
}

/** Normalizes FR/EN gearbox labels onto {@link GearboxType}. */
export function parseGearbox(raw: string | undefined | null): GearboxType | undefined {
  const t = raw?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() ?? '';
  if (!t) return undefined;
  if (/\b(automatique|automatic|auto)\b/.test(t) || t === 'automatique' || t === 'automatic') {
    return 'automatic';
  }
  if (/\b(manuelle|manual)\b/.test(t) || t === 'manuelle' || t === 'manual') return 'manual';
  return undefined;
}
