'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { setWatchedModelAction } from './watchlist-actions.js';
import { setSavedListingAction } from './saved-actions.js';
import { fetchDealsPageAction } from './deal-actions.js';
import { DealCardShell } from './DealCardShell.js';
import { DealSearchBar } from './DealSearchBar.js';
import { SortSelect } from './SortSelect.js';
import { Pagination } from './Pagination.js';
import { PAGE_SIZE, type SortKey } from './dealSort.js';
import { ratingFilterOptions, type FilterOption } from './dealFilters.js';
import { MultiSelect } from './MultiSelect.js';
import { BookmarkIcon } from './icons.js';
import type { DealView } from './dealView.js';
import type { DealsPageInput } from '../src/readModel.js';
import type { DealFacets, DealTab, TabCounts } from '../src/domain/interfaces/ListingRepository.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';
import type { DealTierLevel } from '../src/domain/services/dealTier.js';

/** Debounce for the search box, so we don't hit the server on every keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Eye toggle to follow/unfollow the card's model. */
function WatchEye({
  watching,
  label,
  onToggle,
  locale,
}: {
  watching: boolean;
  label: string;
  onToggle: () => void;
  locale: Locale;
}) {
  const t = useT(locale);
  return (
    <button
      type="button"
      className={watching ? 'watch-eye on' : 'watch-eye'}
      aria-pressed={watching}
      title={watching ? t.card.unwatch(label) : t.card.watch(label)}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        />
        <circle
          cx="12"
          cy="12"
          r="3"
          fill={watching ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}

/** Bookmark toggle to save/unsave the individual listing. */
function SaveButton({
  saved,
  label,
  onToggle,
  locale,
}: {
  saved: boolean;
  label: string;
  onToggle: () => void;
  locale: Locale;
}) {
  const t = useT(locale);
  return (
    <button
      type="button"
      className={saved ? 'watch-eye on' : 'watch-eye'}
      aria-pressed={saved}
      title={saved ? t.card.unsave(label) : t.card.saveNamed(label)}
      onClick={onToggle}
    >
      <BookmarkIcon size={16} filled={saved} />
    </button>
  );
}

function DealCard({
  deal,
  watching,
  saved,
  onToggleWatch,
  onToggleSave,
  locale,
}: {
  deal: DealView;
  watching: boolean;
  saved: boolean;
  onToggleWatch: (modelId: string) => void;
  onToggleSave: (key: string) => void;
  locale: Locale;
}) {
  const label = `${deal.brand} ${deal.model}`;
  const t = useT(locale);
  return (
    <DealCardShell
      data={deal}
      locale={locale}
      scoreTitle={t.card.score(deal.score)}
      matchPct={Math.round(deal.matchConfidence * 100)}
      topRight={
        <div className="card-actions">
          <WatchEye
            watching={watching}
            label={label}
            locale={locale}
            onToggle={() => onToggleWatch(deal.modelId)}
          />
          <SaveButton
            saved={saved}
            label={label}
            locale={locale}
            onToggle={() => onToggleSave(deal.key)}
          />
        </div>
      }
    />
  );
}

const TAB_IDS: DealTab[] = ['daily', 'watched', 'saved', 'all'];

export function DealTabs({
  initialDeals,
  initialTotal,
  initialTab,
  initialSort,
  tabCounts,
  facets,
  watchedModelIds,
  savedKeys,
  locale,
  sidebar,
}: {
  initialDeals: readonly DealView[];
  initialTotal: number;
  initialTab: DealTab;
  initialSort: SortKey;
  tabCounts: TabCounts;
  facets: DealFacets;
  watchedModelIds: readonly string[];
  savedKeys: readonly string[];
  locale: Locale;
  /** Injected sidebar content (saved range + scan control) shown above search/sort. */
  sidebar?: ReactNode;
}) {
  const t = useT(locale);
  // Server-provided page + counts; refreshed on every filter/sort/page change.
  const [deals, setDeals] = useState<readonly DealView[]>(initialDeals);
  const [total, setTotal] = useState(initialTotal);
  const [counts, setCounts] = useState<TabCounts>(tabCounts);

  // Watched models and saved listings live in client state so toggles flip
  // instantly (optimistic); a refetch then refreshes the counts and tabs.
  const [watched, setWatched] = useState<ReadonlySet<string>>(() => new Set(watchedModelIds));
  const [savedSet, setSavedSet] = useState<ReadonlySet<string>>(() => new Set(savedKeys));

  const [active, setActive] = useState<DealTab>(initialTab);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  const kmCap = useMemo(
    () => (facets.maxMileage > 0 ? Math.ceil(facets.maxMileage / 5000) * 5000 : 200000),
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

  const ccCap = useMemo(
    () => (facets.maxCc > 0 ? Math.ceil(facets.maxCc / 50) * 50 : 1300),
    [facets.maxCc],
  );

  const [kmMin, setKmMin] = useState(0);
  const [kmMax, setKmMax] = useState(kmCap);
  const [ccMin, setCcMin] = useState(0);
  const [ccMax, setCcMax] = useState(ccCap);
  const [debouncedKmMin, setDebouncedKmMin] = useState(0);
  const [debouncedKmMax, setDebouncedKmMax] = useState(kmCap);
  const [debouncedCcMin, setDebouncedCcMin] = useState(0);
  const [debouncedCcMax, setDebouncedCcMax] = useState(ccCap);
  const [ratings, setRatings] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [brandsSel, setBrandsSel] = useState<string[]>([]);

  const rangeInvalid = debouncedKmMax < debouncedKmMin || debouncedCcMax < debouncedCcMin;

  // Any control change returns to page 1; only the pager itself keeps a page.
  const resetPage = () => setPage(1);
  const resetFilters = () => {
    setQuery('');
    setKmMin(0);
    setKmMax(kmCap);
    setCcMin(0);
    setCcMax(ccCap);
    setRatings([]);
    setCities([]);
    setBrandsSel([]);
    resetPage();
  };

  // Debounce search + numeric filters so typing doesn't hit the server per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setDebouncedKmMin(kmMin);
      setDebouncedKmMax(kmMax);
      setDebouncedCcMin(ccMin);
      setDebouncedCcMax(ccMax);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, kmMin, kmMax, ccMin, ccMax]);

  // The one place we talk to the server: whenever the tab, search, sort, page,
  // filters or a watch/save toggle (refreshKey) change, fetch that exact page.
  // The initial render is skipped — its data came from the server on first paint.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (rangeInvalid) {
      setDeals([]);
      setTotal(0);
      return;
    }
    const input: DealsPageInput = {
      tab: active,
      search: debouncedQuery.trim(),
      mileageMin: debouncedKmMin,
      // Slider pinned at the data's max means "no upper bound".
      mileageMax: debouncedKmMax >= kmCap ? 0 : debouncedKmMax,
      ccMin: debouncedCcMin,
      ccMax: debouncedCcMax >= ccCap ? 0 : debouncedCcMax,
      ratings,
      cities,
      brands: brandsSel,
      sort,
      page,
    };
    startTransition(async () => {
      const res = await fetchDealsPageAction(input);
      if (res.ok) {
        setDeals(res.deals);
        setTotal(res.total);
        setCounts(res.tabCounts);
      }
    });
    // prettier-ignore
  }, [
    active,
    debouncedQuery,
    sort,
    page,
    debouncedKmMin,
    debouncedKmMax,
    debouncedCcMin,
    debouncedCcMax,
    ratings,
    cities,
    brandsSel,
    refreshKey,
    kmCap,
    ccCap,
    rangeInvalid,
  ]);

  const toggleWatch = (modelId: string) => {
    const willWatch = !watched.has(modelId);
    setWatched(withToggle(watched, modelId, willWatch));
    startTransition(async () => {
      const res = await setWatchedModelAction(modelId, willWatch);
      if (!res.ok) setWatched((prev) => withToggle(prev, modelId, !willWatch));
      else setRefreshKey((k) => k + 1);
    });
  };

  const toggleSave = (key: string) => {
    const willSave = !savedSet.has(key);
    setSavedSet(withToggle(savedSet, key, willSave));
    startTransition(async () => {
      const res = await setSavedListingAction(key, willSave);
      if (!res.ok) setSavedSet((prev) => withToggle(prev, key, !willSave));
      else setRefreshKey((k) => k + 1);
    });
  };

  const selectTab = (id: DealTab) => {
    setActive(id);
    resetPage();
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const emptyNote = (id: DealTab): ReactNode => {
    if (id === 'daily') return t.empty.daily;
    if (id === 'saved') return t.empty.saved;
    if (id === 'watched') {
      return watched.size > 0 ? (
        t.empty.watchedNoListings
      ) : (
        <>
          {t.empty.watchedLead}
          <Link href="/profile" className="card-link">
            {t.nav.profile}
          </Link>
          {t.empty.watchedTail}
        </>
      );
    }
    return t.empty.all;
  };

  return (
    <div className="browse">
      <aside className="browse-sidebar">
        {sidebar}
        <DealSearchBar locale={locale} value={query} onChange={setQuery} />
        <SortSelect
          locale={locale}
          value={sort}
          onChange={(v) => {
            setSort(v);
            resetPage();
          }}
        />

        <div className="filters-head">
          <h3 className="filters-title">{t.filters.title}</h3>
          <button type="button" className="filters-reset" onClick={resetFilters}>
            {t.common.reset}
          </button>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">{t.filters.mileage}</h3>
          <div className="sidebar-row">
            <label>
              <span>{t.common.min}</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={kmMin}
                onChange={(e) => setKmMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>{t.common.max}</span>
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

        <div className="sidebar-section">
          <h3 className="sidebar-title">{t.filters.displacement}</h3>
          <div className="sidebar-row">
            <label>
              <span>{t.common.min}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={ccMin}
                onChange={(e) => setCcMin(Number(e.target.value))}
              />
            </label>
            <label>
              <span>{t.common.max}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={ccMax}
                onChange={(e) => setCcMax(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        <MultiSelect
          locale={locale}
          label={t.filters.dealRating}
          options={ratingFilterOptions((v) => t.tiers[v as DealTierLevel])}
          selected={ratings}
          onChange={(v) => {
            setRatings(v);
            resetPage();
          }}
          allLabel={t.filters.allRatings}
        />

        <MultiSelect
          locale={locale}
          label={t.filters.brand}
          options={brandOptions}
          selected={brandsSel}
          onChange={(v) => {
            setBrandsSel(v);
            resetPage();
          }}
          allLabel={t.filters.allBrands}
        />

        <MultiSelect
          locale={locale}
          label={t.filters.city}
          options={cityOptions}
          selected={cities}
          onChange={(v) => {
            setCities(v);
            resetPage();
          }}
          allLabel={t.filters.allCities}
        />

        {rangeInvalid && <p className="settings-error">{t.filters.rangeInvalid}</p>}
      </aside>

      <div className="browse-main">
        <div className="tabs" role="tablist">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={id === active}
              className={id === active ? 'tab active' : 'tab'}
              onClick={() => selectTab(id)}
              type="button"
            >
              {t.tabs[id]} <span className="tab-count">{counts[id]}</span>
            </button>
          ))}
        </div>

        <div className="browse-count">{t.filters.listingCount(total)}</div>

        <div className="grid" aria-busy={isPending}>
          {deals.map((deal) => (
            <DealCard
              key={deal.key}
              deal={deal}
              watching={watched.has(deal.modelId)}
              saved={savedSet.has(deal.key)}
              onToggleWatch={toggleWatch}
              onToggleSave={toggleSave}
              locale={locale}
            />
          ))}
        </div>

        {deals.length === 0 && (
          <div className="empty">
            {debouncedQuery.trim() ? t.empty.noSearch(debouncedQuery.trim()) : emptyNote(active)}
          </div>
        )}

        <Pagination
          locale={locale}
          page={Math.min(page, pageCount)}
          pageCount={pageCount}
          onPage={setPage}
        />
      </div>
    </div>
  );
}

/** Returns a new set with `item` added or removed. */
function withToggle(set: ReadonlySet<string>, item: string, present: boolean): Set<string> {
  const next = new Set(set);
  if (present) next.add(item);
  else next.delete(item);
  return next;
}
