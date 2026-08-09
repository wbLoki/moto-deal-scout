import type { ReactNode } from 'react';
import { CalendarIcon, ExternalLinkIcon } from './icons.js';
import { ListingImage } from './ListingImage.js';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('fr-MA', { day: 'numeric', month: 'short', year: 'numeric' });
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local calendar midnight, so "days ago" counts dates, not 24h windows. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Human-friendly publish date: "Today" / "Yesterday" / "N days ago" for the
 * last month, an absolute date beyond that. Returns null for a missing/invalid
 * date so the caller can omit the line.
 */
function formatPostDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / MS_PER_DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return dateFmt.format(date);
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
}: {
  data: DealCardData;
  topRight?: ReactNode;
  scoreTitle?: string;
  matchPct?: number;
}) {
  // Prefer the marketplace publish date; fall back to first-seen when absent.
  const postedLabel = formatPostDate(data.postedAt ?? data.createdAt);
  return (
    <article className="card">
      {topRight}
      <span
        className={`tag tag-${data.tierLevel} card-tag`}
        {...(scoreTitle ? { title: scoreTitle } : {})}
      >
        {data.tierLabel}
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
        <div className="card-media-empty">No image</div>
      )}
      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">
            {data.brand} {data.model}
          </h3>
        </div>
        <div className="price">{madFmt.format(data.priceMAD)} MAD</div>
        <div className="meta">
          <span>{data.year ?? 'Year n/a'}</span>
          <span>{data.mileageKm !== null ? `${data.mileageKm} km` : 'km n/a'}</span>
          <span>{data.city}</span>
        </div>
        {matchPct !== undefined && (
          <div className="badges">
            <span className="badge">match {matchPct}%</span>
          </div>
        )}
        <div className="card-footer">
          <a className="card-link" href={data.url} target="_blank" rel="noopener noreferrer">
            View listing
            <ExternalLinkIcon className="icon-trail" size={15} />
          </a>
          {postedLabel && (
            <span className="card-date">
              <CalendarIcon size={13} aria-label="Posted" />
              <span>{postedLabel}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
