'use client';

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { setWatchedModelAction } from './watchlist-actions.js';
import { setSavedListingAction } from './saved-actions.js';
import { DealCardShell, type DealCardData } from './DealCardShell.js';
import { DealSearchBar, matchesQuery } from './DealSearchBar.js';
import { SortSelect } from './SortSelect.js';
import { Pagination } from './Pagination.js';
import { DEFAULT_SORT, PAGE_SIZE, sortDeals, type SortKey } from './dealSort.js';
import { matchesCity, mileageCap, uniqueCities, withinKm } from './dealFilters.js';
import { BookmarkIcon } from './icons.js';

/** Flat, fully-serializable view of a scored listing for the client. */
export interface DealView extends DealCardData {
  modelId: string;
  matchConfidence: number;
}

/** Eye toggle to follow/unfollow the card's model. */
function WatchEye({
  watching,
  label,
  onToggle,
}: {
  watching: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={watching ? 'watch-eye on' : 'watch-eye'}
      aria-pressed={watching}
      title={watching ? `Unwatch ${label}` : `Watch ${label}`}
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
}: {
  saved: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={saved ? 'watch-eye on' : 'watch-eye'}
      aria-pressed={saved}
      title={saved ? `Unsave ${label}` : `Save ${label}`}
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
}: {
  deal: DealView;
  watching: boolean;
  saved: boolean;
  onToggleWatch: (modelId: string) => void;
  onToggleSave: (key: string) => void;
}) {
  const label = `${deal.brand} ${deal.model}`;
  return (
    <DealCardShell
      data={deal}
      scoreTitle={`Score ${deal.score}/100`}
      matchPct={Math.round(deal.matchConfidence * 100)}
      topRight={
        <div className="card-actions">
          <WatchEye
            watching={watching}
            label={label}
            onToggle={() => onToggleWatch(deal.modelId)}
          />
          <SaveButton saved={saved} label={label} onToggle={() => onToggleSave(deal.key)} />
        </div>
      }
    />
  );
}

type TabId = 'daily' | 'watched' | 'saved' | 'all';

export function DealTabs({
  daily,
  all,
  saved,
  watchedModelIds,
  savedKeys,
  hiddenByRange,
  sidebar,
}: {
  daily: readonly DealView[];
  all: readonly DealView[];
  saved: readonly DealView[];
  watchedModelIds: readonly string[];
  savedKeys: readonly string[];
  hiddenByRange: number;
  /** Injected sidebar content (saved range + scan control) shown above search/sort. */
  sidebar?: ReactNode;
}) {
  // Watched models and saved listings live in client state so toggles flip
  // instantly (optimistic) and the Watched/Saved tabs update without a reload.
  const [watched, setWatched] = useState<ReadonlySet<string>>(() => new Set(watchedModelIds));
  const [savedSet, setSavedSet] = useState<ReadonlySet<string>>(() => new Set(savedKeys));
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [page, setPage] = useState(1);

  const kmCap = useMemo(() => mileageCap(all), [all]);
  const cities = useMemo(() => uniqueCities(all), [all]);
  const [kmMin, setKmMin] = useState(0);
  const [kmMax, setKmMax] = useState(kmCap);
  const [city, setCity] = useState('');

  const watchedDeals = useMemo(() => all.filter((d) => watched.has(d.modelId)), [all, watched]);

  // Pool every deal we know about (saved list + current feeds) so a card just
  // saved from the All tab still appears under Saved.
  const dealsByKey = useMemo(() => {
    const m = new Map<string, DealView>();
    for (const d of [...saved, ...all, ...daily]) if (!m.has(d.key)) m.set(d.key, d);
    return m;
  }, [saved, all, daily]);
  const savedDeals = useMemo(
    () => [...savedSet].map((k) => dealsByKey.get(k)).filter((d): d is DealView => d !== undefined),
    [savedSet, dealsByKey],
  );

  const toggleWatch = (modelId: string) => {
    const willWatch = !watched.has(modelId);
    setWatched(withToggle(watched, modelId, willWatch));
    startTransition(async () => {
      const res = await setWatchedModelAction(modelId, willWatch);
      if (!res.ok) setWatched((prev) => withToggle(prev, modelId, !willWatch));
    });
  };

  const toggleSave = (key: string) => {
    const willSave = !savedSet.has(key);
    setSavedSet(withToggle(savedSet, key, willSave));
    startTransition(async () => {
      const res = await setSavedListingAction(key, willSave);
      if (!res.ok) setSavedSet((prev) => withToggle(prev, key, !willSave));
    });
  };

  const tabs: { id: TabId; label: string; deals: readonly DealView[] }[] = [
    { id: 'daily', label: 'Daily deals', deals: daily },
    { id: 'watched', label: 'Your watched models', deals: watchedDeals },
    { id: 'saved', label: 'Saved', deals: savedDeals },
    { id: 'all', label: 'All deals', deals: all },
  ];

  const initial: TabId = tabs.find((t) => t.deals.length > 0)?.id ?? 'all';
  const [active, setActive] = useState<TabId>(initial);
  const activeDeals = tabs.find((t) => t.id === active)?.deals ?? all;

  const kmInvalid = kmMax < kmMin;
  const visible = useMemo(() => {
    if (kmInvalid) return [];
    const filtered = activeDeals.filter(
      (d) =>
        matchesQuery(d, query) && withinKm(d.mileageKm, kmMin, kmMax) && matchesCity(d.city, city),
    );
    return sortDeals(filtered, sort);
  }, [activeDeals, query, sort, kmMin, kmMax, city, kmInvalid]);

  // Return to page 1 whenever the tab, search, ordering or filters change.
  useEffect(() => {
    setPage(1);
  }, [active, query, sort, kmMin, kmMax, city]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = visible.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const emptyNote = (id: TabId) => {
    if (id === 'daily') return 'No new listings today yet — the daily scan runs each morning.';
    if (id === 'saved') {
      return 'No saved bikes yet — tap the bookmark on any card to save it here.';
    }
    if (id === 'watched') {
      return watched.size > 0 ? (
        'No listings for your followed models in range right now.'
      ) : (
        <>
          You&apos;re not following any models yet — tap the eye on a card, or pick some on your{' '}
          <Link href="/profile" className="card-link">
            profile
          </Link>
          .
        </>
      );
    }
    return 'No listings in your range yet. Widen your budget/year, or wait for the next daily scan.';
  };

  return (
    <div className="browse">
      <aside className="browse-sidebar">
        {sidebar}
        <DealSearchBar value={query} onChange={setQuery} />
        <SortSelect value={sort} onChange={setSort} />

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

        {kmInvalid && <p className="settings-error">Max must be greater than or equal to min.</p>}
      </aside>

      <div className="browse-main">
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === active}
              className={t.id === active ? 'tab active' : 'tab'}
              onClick={() => setActive(t.id)}
              type="button"
            >
              {t.label} <span className="tab-count">{t.deals.length}</span>
            </button>
          ))}
        </div>

        <div className="browse-count">
          {visible.length} {visible.length === 1 ? 'listing' : 'listings'}
        </div>

        {pageItems.length === 0 ? (
          <div className="empty">
            {query.trim() && activeDeals.length > 0
              ? `No deals match “${query}”.`
              : emptyNote(active)}
          </div>
        ) : (
          <div className="grid">
            {pageItems.map((deal) => (
              <DealCard
                key={deal.key}
                deal={deal}
                watching={watched.has(deal.modelId)}
                saved={savedSet.has(deal.key)}
                onToggleWatch={toggleWatch}
                onToggleSave={toggleSave}
              />
            ))}
          </div>
        )}

        <Pagination page={clampedPage} pageCount={pageCount} onPage={setPage} />

        {hiddenByRange > 0 && (
          <p className="range-note">
            {hiddenByRange} more listing{hiddenByRange === 1 ? '' : 's'} outside your budget/year
            range.
          </p>
        )}
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
