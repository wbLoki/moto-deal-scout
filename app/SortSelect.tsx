'use client';

import { SORT_OPTIONS, type SortKey } from './dealSort.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

/** Sort dropdown used in the browse sidebar. */
export function SortSelect({
  value,
  onChange,
  locale,
}: {
  value: SortKey;
  onChange: (value: SortKey) => void;
  locale: Locale;
}) {
  const t = useT(locale);
  return (
    <label className="sort-select">
      <span>{t.filters.sortBy}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t.sort[o.value]}
          </option>
        ))}
      </select>
    </label>
  );
}
