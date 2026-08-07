/**
 * How the dashboard feed is ordered. Shared by the client controls and the
 * server-side query so the two can't fall out of sync — the SQL builder maps
 * each key to an ORDER BY, the client only sends the key.
 */
export type SortKey = 'newest' | 'oldest' | 'price-asc' | 'price-desc' | 'score';

export const DEFAULT_SORT: SortKey = 'newest';

/** Deals shown per page (numbered pagination, not infinite scroll). */
export const PAGE_SIZE = 24;
