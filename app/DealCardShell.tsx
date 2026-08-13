'use client';

import type { ReactNode } from 'react';
import { CalendarIcon, ExternalLinkIcon } from './icons.js';
import { ListingImage } from './ListingImage.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';
import type { DealTierLevel } from '../src/domain/services/dealTier.js';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('fr-MA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local calendar midnight, so "days ago" counts dates, not 24h windows. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The visual fields a deal card renders — shared by the public and member feeds. */
export interface DealCardData {
  readonly key: string;
  readonly brand: string;
  readonly model: string;
  readonly priceMAD: number;
  readonly year: number | null;
  readonly mileageKm: number | null;
  readonly city: string;
  readonly sourceId: string;
  readonly url: string;
  readonly imageUrl: string | null;
  readonly tierLabel: string;
  readonly tierLevel: string;
  /** Deal score 0-100 (for the "best deal" sort; not shown on public cards). */
  readonly score: number;
  /** ISO timestamp of when the listing was first seen (for the date sorts). */
  readonly createdAt: string;
  /** ISO marketplace publish date, or null when the source didn't provide one. */
  readonly postedAt: string | null;
}

function isTierLevel(level: string): level is DealTierLevel {
  return (
    level === 'hot' ||
    level === 'great' ||
    level === 'good' ||
    level === 'okay' ||
    level === 'bad' ||
    level === 'calibrating'
  );
}

/**
 * Presentational deal card used by both the anonymous public feed and the
 * logged-in dashboard, so the two look identical. Interactive/affordance
 * differences are injected via `topRight` (watch/save controls, or a
 * "sign in" prompt); member-only extras (`scoreTitle`, `matchPct`) are optional.
 */
export function DealCardShell({
  data,
  topRight,
  scoreTitle,
  matchPct,
  locale,
}: {
  data: DealCardData;
  topRight?: ReactNode;
  scoreTitle?: string;
  matchPct?: number;
  locale: Locale;
}) {
  const t = useT(locale);
  const postedLabel = formatPostDate(data.postedAt ?? data.createdAt, t);
  const tierLabel = isTierLevel(data.tierLevel) ? t.tiers[data.tierLevel] : data.tierLabel;
  return (
    <article className="card">
      {topRight}
      <span
        className={`tag tag-${data.tierLevel} card-tag`}
        {...(scoreTitle ? { title: scoreTitle } : {})}
      >
        {tierLabel}
      </span>
      {data.imageUrl ? (
        <div className="card-media-wrap">
          <ListingImage
            className="card-media"
            src={data.imageUrl}
            alt={`${data.brand} ${data.model}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
          />
        </div>
      ) : (
        <div className="card-media-empty">{t.card.noImage}</div>
      )}
      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">
            {data.brand} {data.model}
          </h3>
        </div>
        <div className="price">{madFmt.format(data.priceMAD)} MAD</div>
        <div className="meta">
          <span>{data.year ?? t.card.yearNa}</span>
          <span>{data.mileageKm !== null ? `${data.mileageKm} km` : t.card.kmNa}</span>
          <span>{data.city}</span>
        </div>
        {matchPct !== undefined && (
          <div className="badges">
            <span className="badge">{t.card.match(matchPct)}</span>
          </div>
        )}
        <div className="card-footer">
          <a className="card-link" href={data.url} target="_blank" rel="noopener noreferrer">
            {t.card.viewListing}
            <ExternalLinkIcon className="icon-trail" size={15} />
          </a>
          {postedLabel && (
            <span className="card-date">
              <CalendarIcon size={13} aria-label={t.card.posted} />
              <span>{postedLabel}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function formatPostDate(iso: string | null, t: ReturnType<typeof useT>): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / MS_PER_DAY);
  if (days <= 0) return t.card.today;
  if (days === 1) return t.card.yesterday;
  if (days < 30) return t.card.daysAgo(days);
  return dateFmt.format(date);
}
