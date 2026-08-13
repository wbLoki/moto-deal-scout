'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from './icons.js';

/**
 * Browse column: search and sort stay visible; the rest of the filters sit
 * behind a toggle on viewports ≤820px so the deal grid is not pushed below
 * a long form. Desktop CSS always shows the filter body and hides the button.
 */
export function BrowseSidebar({
  search,
  sort,
  children,
  filterCount = 0,
}: {
  search: ReactNode;
  sort: ReactNode;
  children: ReactNode;
  /** Count of active MultiSelect values, shown on the mobile toggle. */
  filterCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <aside className="browse-sidebar">
      <div className="browse-tools">
        {search}
        <div className="browse-tools-row">
          {sort}
          <button
            type="button"
            className={open ? 'filters-toggle is-open' : 'filters-toggle'}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            Filters
            {filterCount > 0 && <span className="filters-toggle-count">{filterCount}</span>}
            <ChevronDownIcon size={16} />
          </button>
        </div>
      </div>
      <div id={panelId} className={open ? 'browse-filters is-open' : 'browse-filters'}>
        {children}
      </div>
    </aside>
  );
}
