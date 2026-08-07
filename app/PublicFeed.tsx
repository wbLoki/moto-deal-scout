'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { DealCardShell } from './DealCardShell.js';
import { DealSearchBar } from './DealSearchBar.js';
import { SortSelect } from './SortSelect.js';
import { Pagination } from './Pagination.js';
import { SignInModal } from './SignInModal.js';
import { PAGE_SIZE, type SortKey } from './dealSort.js';
import { MIN_YEAR, RATING_OPTIONS, yearOptions, type FilterOption } from './dealFilters.js';
import { MultiSelect } from './MultiSelect.js';
import { BookmarkIcon, EyeIcon } from './icons.js';
import { fetchPublicDealsPageAction } from './deal-actions.js';
import type { DealView } from './dealView.js';
import type { PublicDealsInput } from '../src/readModel.js';
import type { DealFacets } from '../src/domain/interfaces/ListingRepository.js';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;
const YEARS = yearOptions();
const SEARCH_DEBOUNCE_MS = 300;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

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

/**
 * The public deal feed: a sticky left sidebar (search, sort, budget/year/mileage
 * filters) and a paginated grid. Filtering, sorting and pagination all run in
 * SQL on the server — the browser only holds the page it shows — so anonymous
 * visitors can browse the entire catalog, not just a capped teaser. Signing in
 * is what unlocks a persisted range, following, saving and alerts.
 */
export function PublicFeed({
  initialDeals,
  initialTotal,
  initialSort,
  facets,
}: {
  initialDeals: readonly DealView[];
  initialTotal: number;
  initialSort: SortKey;
  facets: DealFacets;
}) {
  const priceCap = useMemo(
    () => roundUp(Math.max(50000, facets.maxPrice), 5000),
    [facets.maxPrice],
  );
  const kmCap = useMemo(
    () => (facets.maxMileage > 0 ? roundUp(facets.maxMileage, 5000) : 200000),
    [facets.maxMileage],
  );
  const brandOptions = useMemo<FilterOption[]>(
    () => facets.brands.map((b) => ({ value: b.toLowerCase(), label: b })),
    [facets.brands],
  );
  const cityOptions = useMemo<FilterOption[]>(
    () => facets.cities.map((c) => ({ value: c.toLowerCase(), label: titleCase(c) })),
    [facets.cities],
  );

  const [deals, setDeals] = useState<readonly DealView[]>(initialDeals);
  const [total, setTotal] = useState(initialTotal);
  const [isPending, startTransition] = useTransition();

  const [signInFeature, setSignInFeature] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(priceCap);
  const [yearMin, setYearMin] = useState(MIN_YEAR);
  const [yearMax, setYearMax] = useState(MAX_YEAR);
  const [kmMin, setKmMin] = useState(0);
  const [kmMax, setKmMax] = useState(kmCap);
  const [ratings, setRatings] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [brandsSel, setBrandsSel] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const invalid = budgetMax < budgetMin || yearMax < yearMin || kmMax < kmMin;
  const resetPage = () => setPage(1);

  const resetFilters = () => {
    setQuery('');
    setBudgetMin(0);
    setBudgetMax(priceCap);
    setYearMin(MIN_YEAR);
    setYearMax(MAX_YEAR);
    setKmMin(0);
    setKmMax(kmCap);
    setRatings([]);
    setCities([]);
    setBrandsSel([]);
    resetPage();
  };

  // Debounce the search box into the value the fetch depends on.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch the exact page from the server whenever a control changes. The first
  // render is skipped — its data arrived server-rendered as props.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (invalid) {
      setDeals([]);
      setTotal(0);
      return;
    }
    const input: PublicDealsInput = {
      search: debouncedQuery.trim(),
      budgetMin,
      budgetMax,
      yearMin,
      yearMax,
      mileageMin: kmMin,
      mileageMax: kmMax >= kmCap ? 0 : kmMax,
      ratings,
      cities,
      brands: brandsSel,
      sort,
      page,
    };
    startTransition(async () => {
      const res = await fetchPublicDealsPageAction(input);
      if (res.ok) {
        setDeals(res.deals);
        setTotal(res.total);
      }
    });
  }, [
    debouncedQuery,
    sort,
    page,
    budgetMin,
    budgetMax,
    yearMin,
    yearMax,
    kmMin,
    kmMax,
    ratings,
    cities,
    brandsSel,
    invalid,
    kmCap,
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="browse">
      <aside className="browse-sidebar">
        <DealSearchBar value={query} onChange={setQuery} />
        <SortSelect
          value={sort}
          onChange={(v) => {
            setSort(v);
            resetPage();
          }}
        />

        <div className="filters-head">
          <h3 className="filters-title">Filters</h3>
          <button type="button" className="filters-reset" onClick={resetFilters}>
            Reset
          </button>
        </div>

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
                onChange={(e) => {
                  setBudgetMin(Number(e.target.value));
                  resetPage();
                }}
              />
            </label>
            <label>
              <span>Max</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={budgetMax}
                onChange={(e) => {
                  setBudgetMax(Number(e.target.value));
                  resetPage();
                }}
              />
            </label>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">Model year</h3>
          <div className="sidebar-row">
            <label>
              <span>From</span>
              <select
                value={yearMin}
                onChange={(e) => {
                  setYearMin(Number(e.target.value));
                  resetPage();
                }}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>To</span>
              <select
                value={yearMax}
                onChange={(e) => {
                  setYearMax(Number(e.target.value));
                  resetPage();
                }}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
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
                onChange={(e) => {
                  setKmMin(Number(e.target.value));
                  resetPage();
                }}
              />
            </label>
            <label>
              <span>Max</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={kmMax}
                onChange={(e) => {
                  setKmMax(Number(e.target.value));
                  resetPage();
                }}
              />
            </label>
          </div>
        </div>

        <MultiSelect
          label="Deal rating"
          options={RATING_OPTIONS}
          selected={ratings}
          onChange={(v) => {
            setRatings(v);
            resetPage();
          }}
          allLabel="All ratings"
        />

        <MultiSelect
          label="Brand"
          options={brandOptions}
          selected={brandsSel}
          onChange={(v) => {
            setBrandsSel(v);
            resetPage();
          }}
          allLabel="All brands"
        />

        <MultiSelect
          label="City"
          options={cityOptions}
          selected={cities}
          onChange={(v) => {
            setCities(v);
            resetPage();
          }}
          allLabel="All cities"
        />

        {invalid && <p className="settings-error">Max must be greater than or equal to min.</p>}
      </aside>

      <div className="browse-main">
        <div className="browse-count">
          {total} {total === 1 ? 'listing' : 'listings'}
        </div>

        <div className="grid" aria-busy={isPending}>
          {deals.map((deal) => (
            <DealCardShell
              key={deal.key}
              data={deal}
              topRight={<PublicCardActions onNeedSignIn={setSignInFeature} />}
            />
          ))}
        </div>

        {deals.length === 0 && (
          <div className="empty">
            {invalid ? 'Check your filter values.' : 'No deals match your filters.'}
          </div>
        )}

        <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onPage={setPage} />
      </div>

      <SignInModal feature={signInFeature} onClose={() => setSignInFeature(null)} />
    </div>
  );
}
