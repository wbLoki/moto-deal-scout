import type { DealCardData } from './DealCardShell.js';

/** Mileage filter. Listings with no mileage ("km n/a") always pass, like the year filter. */
export function withinKm(mileageKm: number | null, min: number, max: number): boolean {
  if (mileageKm === null) return true;
  return mileageKm >= min && mileageKm <= max;
}

/**
 * City filter. The selected value is a lowercased city key (or '' for all);
 * matching is case-insensitive so "Casablanca" and "CASABLANCA" are one city.
 */
export function matchesCity(city: string, selected: string): boolean {
  return selected === '' || city.trim().toLowerCase() === selected;
}

export interface CityOption {
  /** Lowercased key used for matching. */
  readonly value: string;
  /** Tidy display label. */
  readonly label: string;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Distinct cities present in a set of deals, deduped case-insensitively and
 * shown title-cased, alphabetically.
 */
export function uniqueCities(deals: readonly DealCardData[]): CityOption[] {
  const byKey = new Map<string, string>();
  for (const d of deals) {
    const key = d.city.trim().toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, titleCase(d.city.trim()));
  }
  return [...byKey.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A tidy upper bound for the mileage filter, from the data (fallback 200 000). */
export function mileageCap(deals: readonly DealCardData[]): number {
  const kms = deals.map((d) => d.mileageKm).filter((m): m is number => m !== null);
  if (kms.length === 0) return 200000;
  return Math.ceil(Math.max(...kms) / 5000) * 5000;
}
