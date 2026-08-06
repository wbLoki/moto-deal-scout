'use client';

import { SORT_OPTIONS, type SortKey } from './dealSort.js';

/** Sort dropdown used in the browse sidebar. */
export function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (value: SortKey) => void;
}) {
  return (
    <label className="sort-select">
      <span>Sort by</span>
      <select value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
