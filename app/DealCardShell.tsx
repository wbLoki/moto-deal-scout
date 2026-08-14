'use client';

import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarIcon, CloseIcon, ExternalLinkIcon } from './icons.js';
import { ListingImage } from './ListingImage.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';
import type { FuelType, GearboxType, VehicleType } from '../src/domain/entities/VehicleType.js';
import type { DealTierLevel } from '../src/domain/services/dealTier.js';
import { fetchModelYearMarketAction } from './market-actions.js';
import type { ModelYearMarket } from '../src/domain/interfaces/ListingRepository.js';

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
  readonly externalId: string;
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
  readonly vehicleType: VehicleType;
  readonly modelId: string;
  readonly fuelType: FuelType | null;
  readonly gearbox: GearboxType | null;
  readonly firstOwner: boolean | null;
  readonly ww: boolean | null;
  readonly accidented: boolean | null;
  readonly customsCleared: boolean | null;
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
 * logged-in dashboard. Click the card body (not marketplace link / bookmark)
 * to open a popup with fuel/gearbox, condition, and model-year market.
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
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<ModelYearMarket | null>(null);
  const [marketStatus, setMarketStatus] = useState<'idle' | 'loading' | 'done'>('idle');

  const loadMarket = () => {
    if (marketStatus !== 'idle') return;
    setMarketStatus('loading');
    void fetchModelYearMarketAction({
      modelId: data.modelId,
      year: data.year,
      vehicleType: data.vehicleType,
      sourceId: data.sourceId,
      externalId: data.externalId,
      listingPrice: data.priceMAD,
    }).then((res) => {
      setMarket(res.market);
      setMarketStatus('done');
    });
  };

  const openPopup = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    setOpen(true);
    loadMarket();
  };

  const closePopup = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopup();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const showPowertrain = Boolean(data.fuelType || data.gearbox);
  const title = `${data.brand} ${data.model}`;

  return (
    <>
      <article className="card" onClick={openPopup}>
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
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div className="card-media-empty">{t.card.noImage}</div>
        )}
        <div className="card-body">
          <div className="card-top">
            <h3 className="card-title">{title}</h3>
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
      {open &&
        createPortal(
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`deal-${data.key}`}
            onClick={closePopup}
          >
            <div className="modal deal-modal" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="modal-close"
                aria-label={t.common.close}
                onClick={closePopup}
              >
                <CloseIcon size={18} />
              </button>
              {data.imageUrl ? (
                <div className="deal-modal-media">
                  <ListingImage
                    className="deal-modal-img"
                    src={data.imageUrl}
                    alt={title}
                    fill
                    sizes="(max-width: 640px) 100vw, 480px"
                  />
                </div>
              ) : (
                <div className="deal-modal-media empty">{t.card.noImage}</div>
              )}
              <span className={`tag tag-${data.tierLevel}`}>{tierLabel}</span>
              <h2 id={`deal-${data.key}`} className="modal-title">
                {title}
              </h2>
              <div className="price">{madFmt.format(data.priceMAD)} MAD</div>
              <div className="meta">
                <span>{data.year ?? t.card.yearNa}</span>
                <span>{data.mileageKm !== null ? `${data.mileageKm} km` : t.card.kmNa}</span>
                <span>{data.city}</span>
              </div>
              {postedLabel && (
                <p className="card-details-row muted">
                  {t.card.posted}: {postedLabel}
                </p>
              )}
              <div className="card-details">
                {showPowertrain && (
                  <p className="card-details-row">
                    {data.fuelType ? t.filters[data.fuelType] : null}
                    {data.fuelType && data.gearbox ? ' · ' : null}
                    {data.gearbox ? t.filters[data.gearbox] : null}
                  </p>
                )}
                <ConditionFlags data={data} locale={locale} />
                <MarketBlock
                  data={data}
                  market={market}
                  loading={marketStatus === 'loading'}
                  locale={locale}
                />
              </div>
              <div className="modal-actions">
                <a className="btn btn-primary" href={data.url} target="_blank" rel="noopener noreferrer">
                  {t.card.viewListing}
                  <ExternalLinkIcon className="icon-trail" size={15} />
                </a>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function ConditionFlags({ data, locale }: { data: DealCardData; locale: Locale }) {
  const t = useT(locale);
  const chips: string[] = [];
  if (data.firstOwner) chips.push(t.card.firstOwner);
  if (data.ww) chips.push(t.card.ww);
  if (data.customsCleared) chips.push(t.card.customsCleared);
  if (data.accidented === true) chips.push(t.card.accidented);
  if (data.accidented === false) chips.push(t.card.neverAccidented);
  if (chips.length === 0) return null;
  return <p className="card-details-row">{chips.join(' · ')}</p>;
}

function MarketBlock({
  data,
  market,
  loading,
  locale,
}: {
  data: DealCardData;
  market: ModelYearMarket | null;
  loading: boolean;
  locale: Locale;
}) {
  const t = useT(locale);
  if (loading) return <p className="card-details-row muted">{t.card.marketLoading}</p>;
  if (!market || market.samples === 0) {
    return <p className="card-details-row muted">{t.card.marketEmpty}</p>;
  }
  const yearLabel = data.year ?? t.card.yearNa;
  const band =
    market.p25 != null && market.p75 != null
      ? t.card.marketBand(madFmt.format(market.p25), madFmt.format(market.p75), market.samples)
      : t.card.marketSamples(market.samples);
  return (
    <div className="card-market">
      <p className="card-details-row">
        {t.card.marketTitle(data.model, yearLabel)} — {band}
      </p>
      {market.median != null && (
        <p className="card-details-row muted">
          {t.card.marketThisListing(madFmt.format(data.priceMAD), madFmt.format(market.median))}
        </p>
      )}
      {market.events.length > 1 && <Sparkline events={market.events} />}
    </div>
  );
}

function Sparkline({
  events,
}: {
  events: readonly { readonly observedAt: string; readonly priceMAD: number }[];
}) {
  const prices = events.map((e) => e.priceMAD);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(1, max - min);
  const w = 160;
  const h = 28;
  const pts = prices
    .map((p, i) => {
      const x = prices.length === 1 ? w / 2 : (i / (prices.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="card-sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
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
