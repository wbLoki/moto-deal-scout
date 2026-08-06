import type { DealCardData } from './DealCardShell.js';

export type SortKey = 'newest' | 'oldest' | 'price-asc' | 'price-desc' | 'score';

export const DEFAULT_SORT: SortKey = 'newest';

/** Deals shown per page (pagination, not infinite scroll). */
export const PAGE_SIZE = 24;

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price-asc', label: 'Price: low → high' },
  { value: 'price-desc', label: 'Price: high → low' },
  { value: 'score', label: 'Best deal' },
];

/** Returns a new array of deals ordered by the given sort key. */
export function sortDeals<T extends DealCardData>(deals: readonly T[], key: SortKey): T[] {
  const arr = [...deals];
  switch (key) {
    case 'newest':
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':
      return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'price-asc':
      return arr.sort((a, b) => a.priceMAD - b.priceMAD);
    case 'price-desc':
      return arr.sort((a, b) => b.priceMAD - a.priceMAD);
    case 'score':
      return arr.sort((a, b) => b.score - a.score);
  }
}
