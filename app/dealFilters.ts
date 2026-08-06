import type { DealCardData } from './DealCardShell.js';

/** Mileage filter. Listings with no mileage ("km n/a") always pass, like the year filter. */
export function withinKm(mileageKm: number | null, min: number, max: number): boolean {
  if (mileageKm === null) return true;
  return mileageKm >= min && mileageKm <= max;
}

/**
 * City filter. `selected` is a list of lowercased city keys (empty = all);
 * matching is case-insensitive so "Casablanca" and "CASABLANCA" are one city.
 */
export function matchesCity(city: string, selected: readonly string[]): boolean {
  return selected.length === 0 || selected.includes(city.trim().toLowerCase());
}

/** Brand filter against a list of lowercased brand keys (empty = all). */
export function matchesBrand(brand: string, selected: readonly string[]): boolean {
  return selected.length === 0 || selected.includes(brand.trim().toLowerCase());
}

/** Deal-rating (tier) filter against a list of tier levels (empty = all). */
export function matchesRating(tierLevel: string, selected: readonly string[]): boolean {
  return selected.length === 0 || selected.includes(tierLevel);
}

/** The deal-rating options, matching src/domain/services/dealTier.ts levels. */
export const RATING_OPTIONS: readonly FilterOption[] = [
  { value: 'hot', label: 'Hot deal' },
  { value: 'great', label: 'Very good deal' },
  { value: 'good', label: 'Good deal' },
  { value: 'okay', label: 'Okay' },
  { value: 'bad', label: 'Bad deal' },
  { value: 'calibrating', label: 'Calibrating' },
];

export interface FilterOption {
  /** Lowercased key used for matching. */
  readonly value: string;
  /** Display label. */
  readonly label: string;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Deduped options keyed case-insensitively; `label` maps each key to a display string. */
function options(
  deals: readonly DealCardData[],
  pick: (d: DealCardData) => string,
  label: (raw: string) => string,
): FilterOption[] {
  const byKey = new Map<string, string>();
  for (const d of deals) {
    const raw = pick(d).trim();
    const key = raw.toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, label(raw));
  }
  return [...byKey.entries()]
    .map(([value, lbl]) => ({ value, label: lbl }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Distinct cities in the deals, deduped case-insensitively and title-cased. */
export function uniqueCities(deals: readonly DealCardData[]): FilterOption[] {
  return options(deals, (d) => d.city, titleCase);
}

/** Distinct brands in the deals, deduped case-insensitively (original casing kept, e.g. "KTM"). */
export function uniqueBrands(deals: readonly DealCardData[]): FilterOption[] {
  return options(
    deals,
    (d) => d.brand,
    (raw) => raw,
  );
}

/** A tidy upper bound for the mileage filter, from the data (fallback 200 000). */
export function mileageCap(deals: readonly DealCardData[]): number {
  const kms = deals.map((d) => d.mileageKm).filter((m): m is number => m !== null);
  if (kms.length === 0) return 200000;
  return Math.ceil(Math.max(...kms) / 5000) * 5000;
}

/** Oldest model year offered in the year dropdowns. */
export const MIN_YEAR = 2000;

/** Years (newest first) for the model-year dropdowns: from next year down to MIN_YEAR. */
export function yearOptions(): number[] {
  const max = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = max; y >= MIN_YEAR; y--) years.push(y);
  return years;
}
