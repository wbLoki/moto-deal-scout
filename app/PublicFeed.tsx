'use client';

import { useEffect, useMemo, useState } from 'react';
import { DealCardShell, type DealCardData } from './DealCardShell.js';
import { DealSearchBar, matchesQuery } from './DealSearchBar.js';
import { SortSelect } from './SortSelect.js';
import { Pagination } from './Pagination.js';
import { SignInModal } from './SignInModal.js';
import { DEFAULT_SORT, PAGE_SIZE, sortDeals, type SortKey } from './dealSort.js';
import { matchesCity, mileageCap, uniqueCities, withinKm } from './dealFilters.js';
import { BookmarkIcon, EyeIcon } from './icons.js';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * The members-only controls as they appear for anonymous visitors: clicking
 * either prompts sign-in rather than navigating away.
 */
function PublicCardActions({ onNeedSignIn }: { onNeedSignIn: (feature: string) => void }) {
  return (
    <div className="card-actions">
      <button
        type="button"
        className="watch-eye"
        title="Follow this model"
        aria-label="Follow this model"
        onClick={() => onNeedSignIn('follow models')}
      >
        <EyeIcon size={18} />
      </button>
      <button
        type="button"
        className="watch-eye"
        title="Save this bike"
        aria-label="Save this bike"
        onClick={() => onNeedSignIn('save bikes')}
      >
        <BookmarkIcon size={16} />
      </button>
    </div>
  );
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * The public deal feed: a sticky left sidebar (search, sort, budget/year
 * filters) and a paginated grid. Everything is client-side (nothing saved) —
 * signing in is what unlocks a persisted range, following, saving and alerts.
 */
export function PublicFeed({ deals }: { deals: readonly DealCardData[] }) {
  const priceCap = useMemo(
    () => roundUp(Math.max(50000, ...deals.map((d) => d.priceMAD)), 5000),
    [deals],
  );
  const kmCap = useMemo(() => mileageCap(deals), [deals]);
  const cities = useMemo(() => uniqueCities(deals), [deals]);

  const [signInFeature, setSignInFeature] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(priceCap);
  const [yearMin, setYearMin] = useState(2000);
  const [yearMax, setYearMax] = useState(CURRENT_YEAR + 1);
  const [kmMin, setKmMin] = useState(0);
  const [kmMax, setKmMax] = useState(kmCap);
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);

  const invalid = budgetMax < budgetMin || yearMax < yearMin || kmMax < kmMin;

  const visible = useMemo(() => {
    if (invalid) return [];
    const filtered = deals.filter((d) => {
      if (d.priceMAD < budgetMin || d.priceMAD > budgetMax) return false;
      if (d.year !== null && (d.year < yearMin || d.year > yearMax)) return false;
      if (!withinKm(d.mileageKm, kmMin, kmMax)) return false;
      if (!matchesCity(d.city, city)) return false;
      return matchesQuery(d, query);
    });
    return sortDeals(filtered, sort);
  }, [deals, budgetMin, budgetMax, yearMin, yearMax, kmMin, kmMax, city, query, sort, invalid]);

  // Any change to the result set or ordering returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [budgetMin, budgetMax, yearMin, yearMax, kmMin, kmMax, city, query, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = visible.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return (
    <div className="browse">
      <aside className="browse-sidebar">
        <DealSearchBar value={query} onChange={setQuery} />
        <SortSelect value={sort} onChange={setSort} />

        <div className="sidebar-section">
          <h3 className="sidebar-title">Budget (MAD)</h3>
          <div className="sidebar-row">
            <label>
              <span>Min</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={budgetMin}
                onChange={(e) => setBudgetMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Max</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">Model year</h3>
          <div className="sidebar-row">
            <label>
              <span>From</span>
              <input
                type="number"
                min={1980}
                max={CURRENT_YEAR + 1}
                value={yearMin}
                onChange={(e) => setYearMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="number"
                min={1980}
                max={CURRENT_YEAR + 1}
                value={yearMax}
                onChange={(e) => setYearMax(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">Mileage (km)</h3>
          <div className="sidebar-row">
            <label>
              <span>Min</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={kmMin}
                onChange={(e) => setKmMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Max</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={kmMax}
                onChange={(e) => setKmMax(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        <label className="sidebar-select">
          <span>City</span>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {invalid && <p className="settings-error">Max must be greater than or equal to min.</p>}
      </aside>

      <div className="browse-main">
        <div className="browse-count">
          {visible.length} {visible.length === 1 ? 'listing' : 'listings'}
        </div>

        {pageItems.length === 0 ? (
          <div className="empty">
            {invalid ? 'Check your filter values.' : 'No deals match your filters.'}
          </div>
        ) : (
          <div className="grid">
            {pageItems.map((deal) => (
              <DealCardShell
                key={deal.key}
                data={deal}
                topRight={<PublicCardActions onNeedSignIn={setSignInFeature} />}
              />
            ))}
          </div>
        )}

        <Pagination page={clampedPage} pageCount={pageCount} onPage={setPage} />
      </div>

      <SignInModal feature={signInFeature} onClose={() => setSignInFeature(null)} />
    </div>
  );
}
