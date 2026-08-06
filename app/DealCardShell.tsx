import type { ReactNode } from 'react';
import { ExternalLinkIcon } from './icons.js';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

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
  return (
    <article className="card">
      {topRight}
      {data.imageUrl ? (
        <img
          className="card-media"
          src={data.imageUrl}
          alt={`${data.brand} ${data.model}`}
          loading="lazy"
        />
      ) : (
        <div className="card-media-empty">No image</div>
      )}
      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">
            {data.brand} {data.model}
          </h3>
          <span
            className={`tag tag-${data.tierLevel}`}
            {...(scoreTitle ? { title: scoreTitle } : {})}
          >
            {data.tierLabel}
          </span>
        </div>
        <div className="price">{madFmt.format(data.priceMAD)} MAD</div>
        <div className="meta">
          <span>{data.year ?? 'Year n/a'}</span>
          <span>{data.mileageKm !== null ? `${data.mileageKm} km` : 'km n/a'}</span>
          <span>{data.city}</span>
        </div>
        <div className="badges">
          <span className="badge">{data.sourceId}</span>
          {matchPct !== undefined && <span className="badge">match {matchPct}%</span>}
        </div>
        <a className="card-link" href={data.url} target="_blank" rel="noopener noreferrer">
          View listing
          <ExternalLinkIcon className="icon-trail" size={15} />
        </a>
      </div>
    </article>
  );
}
