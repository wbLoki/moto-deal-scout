'use client';

import { SearchIcon } from './icons.js';

/** Shared text search over the visible deals (brand / model / city). */
export function DealSearchBar({
  value,
  onChange,
  placeholder = 'Search by brand, model or city…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="deal-search">
      <SearchIcon size={18} className="deal-search-icon" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search deals"
      />
    </div>
  );
}

/** True if the deal matches a free-text query over brand, model and city. */
export function matchesQuery(
  deal: { brand: string; model: string; city: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${deal.brand} ${deal.model} ${deal.city}`.toLowerCase().includes(q);
}
