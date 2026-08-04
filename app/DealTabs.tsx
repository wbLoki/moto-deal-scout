'use client';

import { useState } from 'react';
import Link from 'next/link';

/** Flat, fully-serializable view of a scored listing for the client. */
export interface DealView {
  key: string;
  brand: string;
  model: string;
  priceMAD: number;
  year: number | null;
  mileageKm: number | null;
  city: string;
  sourceId: string;
  url: string;
  imageUrl: string | null;
  matchConfidence: number;
  score: number;
  tierLabel: string;
  tierLevel: string;
}

const madFmt = new Intl.NumberFormat('fr-MA');

function DealCard({ deal }: { deal: DealView }) {
  return (
    <article className="card">
      {deal.imageUrl ? (
        <img
          className="card-media"
          src={deal.imageUrl}
          alt={`${deal.brand} ${deal.model}`}
          loading="lazy"
        />
      ) : (
        <div className="card-media-empty">No image</div>
      )}
      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">
            {deal.brand} {deal.model}
          </h3>
          <span className={`tag tag-${deal.tierLevel}`} title={`Score ${deal.score}/100`}>
            {deal.tierLabel}
          </span>
        </div>
        <div className="price">{madFmt.format(deal.priceMAD)} MAD</div>
        <div className="meta">
          <span>{deal.year ?? 'Year n/a'}</span>
          <span>{deal.mileageKm !== null ? `${deal.mileageKm} km` : 'km n/a'}</span>
          <span>{deal.city}</span>
        </div>
        <div className="badges">
          <span className="badge">{deal.sourceId}</span>
          <span className="badge">match {Math.round(deal.matchConfidence * 100)}%</span>
        </div>
        <a className="card-link" href={deal.url} target="_blank" rel="noopener noreferrer">
          View listing →
        </a>
      </div>
    </article>
  );
}

type TabId = 'daily' | 'watched' | 'all';

export function DealTabs({
  daily,
  watched,
  all,
  followsAnyModel,
  hiddenByRange,
}: {
  daily: readonly DealView[];
  watched: readonly DealView[];
  all: readonly DealView[];
  followsAnyModel: boolean;
  hiddenByRange: number;
}) {
  const tabs: { id: TabId; label: string; deals: readonly DealView[] }[] = [
    { id: 'daily', label: 'Daily deals', deals: daily },
    { id: 'watched', label: 'Your watched models', deals: watched },
    { id: 'all', label: 'All deals', deals: all },
  ];

  // Open on the first tab that actually has something, falling back to "All".
  const initial: TabId = tabs.find((t) => t.deals.length > 0)?.id ?? 'all';
  const [active, setActive] = useState<TabId>(initial);
  const currentDeals = active === 'daily' ? daily : active === 'watched' ? watched : all;

  const emptyNote = (id: TabId) => {
    if (id === 'daily') return 'No new listings today yet — the daily scan runs each morning.';
    if (id === 'watched') {
      return followsAnyModel ? (
        'No listings for your followed models in range right now.'
      ) : (
        <>
          You&apos;re not following any models yet. Pick some on your{' '}
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
            <DealCard key={deal.key} deal={deal} />
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
