'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { setWatchedModelAction } from './watchlist-actions.js';
import { DealCardShell, type DealCardData } from './DealCardShell.js';

/** Flat, fully-serializable view of a scored listing for the client. */
export interface DealView extends DealCardData {
  modelId: string;
  matchConfidence: number;
  score: number;
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

function DealCard({
  deal,
  watching,
  onToggleWatch,
}: {
  deal: DealView;
  watching: boolean;
  onToggleWatch: (modelId: string) => void;
}) {
  return (
    <DealCardShell
      data={deal}
      scoreTitle={`Score ${deal.score}/100`}
      matchPct={Math.round(deal.matchConfidence * 100)}
      topRight={
        <WatchEye
          watching={watching}
          label={`${deal.brand} ${deal.model}`}
          onToggle={() => onToggleWatch(deal.modelId)}
        />
      }
    />
  );
}

type TabId = 'daily' | 'watched' | 'all';

export function DealTabs({
  daily,
  all,
  watchedModelIds,
  hiddenByRange,
}: {
  daily: readonly DealView[];
  all: readonly DealView[];
  watchedModelIds: readonly string[];
  hiddenByRange: number;
}) {
  // Watched models live in client state so the eye toggles flip every card of
  // that model at once and the Watched tab updates instantly (optimistic).
  const [watched, setWatched] = useState<ReadonlySet<string>>(() => new Set(watchedModelIds));
  const [, startToggle] = useTransition();

  const watchedDeals = useMemo(() => all.filter((d) => watched.has(d.modelId)), [all, watched]);

  const toggleWatch = (modelId: string) => {
    const willWatch = !watched.has(modelId);
    const next = new Set(watched);
    if (willWatch) next.add(modelId);
    else next.delete(modelId);
    setWatched(next);
    startToggle(async () => {
      const res = await setWatchedModelAction(modelId, willWatch);
      if (!res.ok) {
        // Revert on failure.
        setWatched((prev) => {
          const reverted = new Set(prev);
          if (willWatch) reverted.delete(modelId);
          else reverted.add(modelId);
          return reverted;
        });
      }
    });
  };

  const tabs: { id: TabId; label: string; deals: readonly DealView[] }[] = [
    { id: 'daily', label: 'Daily deals', deals: daily },
    { id: 'watched', label: 'Your watched models', deals: watchedDeals },
    { id: 'all', label: 'All deals', deals: all },
  ];

  const initial: TabId = tabs.find((t) => t.deals.length > 0)?.id ?? 'all';
  const [active, setActive] = useState<TabId>(initial);
  const currentDeals = tabs.find((t) => t.id === active)?.deals ?? all;

  const emptyNote = (id: TabId) => {
    if (id === 'daily') return 'No new listings today yet — the daily scan runs each morning.';
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
    return 'No listings in your range yet. Widen your budget/year above, or wait for the next daily scan.';
  };

  return (
    <div className="tabs-wrap">
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

      {currentDeals.length === 0 ? (
        <div className="empty">{emptyNote(active)}</div>
      ) : (
        <div className="grid">
          {currentDeals.map((deal) => (
            <DealCard
              key={deal.key}
              deal={deal}
              watching={watched.has(deal.modelId)}
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
      )}

      {hiddenByRange > 0 && (
        <p className="range-note">
          {hiddenByRange} more listing{hiddenByRange === 1 ? '' : 's'} outside your budget/year
          range.
        </p>
      )}
    </div>
  );
}
