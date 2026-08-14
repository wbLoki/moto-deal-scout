'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { DealCardData } from './DealCardShell.js';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, PinIcon } from './icons.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';
import { fetchModelYearMarketAction } from './market-actions.js';
import { ListingImage } from './ListingImage.js';
import type { ModelYearMarket } from '../src/domain/interfaces/ListingRepository.js';
import type { DealTierLevel } from '../src/domain/services/dealTier.js';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('fr-MA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

function marketplaceLabel(sourceId: string): string {
  if (sourceId === 'avito' || sourceId === 'avito-cars') return 'Avito';
  if (sourceId === 'biker') return 'Biker';
  if (sourceId === 'moteur') return 'Moteur';
  return sourceId;
}

export function ListingDetail({
  data,
  locale,
  feedHref,
}: {
  data: DealCardData;
  locale: Locale;
  feedHref: string;
}) {
  const t = useT(locale);
  const postedLabel = formatPostDate(data.postedAt ?? data.createdAt, t);
  const tierLabel = isTierLevel(data.tierLevel) ? t.tiers[data.tierLevel] : data.tierLabel;
  const title = `${data.brand} ${data.model}`;
  const marketplace = marketplaceLabel(data.sourceId);
  const conditions = conditionChips(data, t);
  const feedLabel = data.vehicleType === 'car' ? t.nav.cars : t.nav.motos;
  const [market, setMarket] = useState<ModelYearMarket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchModelYearMarketAction({
      modelId: data.modelId,
      year: data.year,
      vehicleType: data.vehicleType,
      sourceId: data.sourceId,
      externalId: data.externalId,
      listingPrice: data.priceMAD,
    }).then((res) => {
      if (cancelled) return;
      setMarket(res.market);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    data.modelId,
    data.year,
    data.vehicleType,
    data.sourceId,
    data.externalId,
    data.priceMAD,
  ]);

  const cta = (
    <a className="btn btn-primary listing-cta" href={data.url} target="_blank" rel="noopener noreferrer">
      {t.listing.viewOn(marketplace)}
      <ExternalLinkIcon className="icon-trail" size={16} />
    </a>
  );

  return (
    <article className="listing">
      <nav className="listing-crumb" aria-label={t.card.backToFeed}>
        <Link href={feedHref}>{feedLabel}</Link>
        <span aria-hidden="true">/</span>
        <span>{data.brand}</span>
        <span aria-hidden="true">/</span>
        <span>{data.model}</span>
      </nav>

      <div className="listing-layout">
        <ListingGallery data={data} title={title} locale={locale} />

        <aside className="listing-buy">
          <span className={`tag tag-${data.tierLevel}`}>{tierLabel}</span>
          <h1 id="listing-title" className="listing-title">
            {title}
          </h1>
          <p className="listing-price">{madFmt.format(data.priceMAD)} MAD</p>
          {data.score > 0 ? <p className="listing-score">{t.card.score(data.score)}</p> : null}
          <p className="listing-place">
            <PinIcon size={15} />
            <span>{data.city}</span>
            {postedLabel ? (
              <>
                <span className="listing-dot" aria-hidden="true">
                  ·
                </span>
                <CalendarIcon size={14} />
                <span>{postedLabel}</span>
              </>
            ) : null}
          </p>
          <div className="listing-buy-cta">{cta}</div>
        </aside>
      </div>

      <section className="listing-panel">
        <h2>{t.listing.details}</h2>
        <div className="listing-tiles">
          <SpecTile label={t.listing.year} value={data.year != null ? String(data.year) : t.card.yearNa} />
          <SpecTile
            label={t.listing.mileage}
            value={data.mileageKm !== null ? `${madFmt.format(data.mileageKm)} km` : t.card.kmNa}
          />
          <SpecTile label={t.listing.city} value={data.city} />
          {data.fuelType ? <SpecTile label={t.listing.fuel} value={t.filters[data.fuelType]} /> : null}
          {data.gearbox ? <SpecTile label={t.listing.gearbox} value={t.filters[data.gearbox]} /> : null}
        </div>
        {conditions.length > 0 ? (
          <ul className="listing-pills">
            {conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="listing-panel">
        <h2>{t.listing.market}</h2>
        <MarketPanel data={data} market={market} loading={loading} locale={locale} />
      </section>

      <div className="listing-dock">
        <div className="listing-dock-price">
          <strong>{madFmt.format(data.priceMAD)} MAD</strong>
          <span>{data.city}</span>
        </div>
        {cta}
      </div>
    </article>
  );
}

function ListingGallery({
  data,
  title,
  locale,
}: {
  data: DealCardData;
  title: string;
  locale: Locale;
}) {
  const t = useT(locale);
  const photos = data.imageUrls.length > 0 ? data.imageUrls : data.imageUrl ? [data.imageUrl] : [];
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const count = photos.length;
  const current = photos[Math.min(index, Math.max(0, count - 1))];

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((i) => (i + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    setIndex(0);
  }, [data.key]);

  useEffect(() => {
    if (count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, go]);

  if (!current) {
    return (
      <div className="listing-gallery-wrap">
        <div className="listing-gallery">
          <span className="listing-photo-empty">{t.card.noImage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="listing-gallery-wrap">
      <div
        className="listing-gallery"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          startX.current = event.clientX;
        }}
        onPointerUp={(event) => {
          const start = startX.current;
          startX.current = null;
          if (start == null) return;
          const dx = event.clientX - start;
          if (dx > 48) go(-1);
          else if (dx < -48) go(1);
        }}
        onPointerCancel={() => {
          startX.current = null;
        }}
      >
        <ListingImage
          className="listing-photo-img"
          src={current}
          alt={title}
          fill
          sizes="(max-width: 840px) 100vw, 62vw"
        />
        {count > 1 ? (
          <>
            <button
              type="button"
              className="listing-gallery-nav listing-gallery-prev"
              onClick={() => go(-1)}
              aria-label={t.listing.prevPhoto}
            >
              <ChevronLeftIcon size={22} />
            </button>
            <button
              type="button"
              className="listing-gallery-nav listing-gallery-next"
              onClick={() => go(1)}
              aria-label={t.listing.nextPhoto}
            >
              <ChevronRightIcon size={22} />
            </button>
            <span className="listing-gallery-count">{t.listing.photoOf(index + 1, count)}</span>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <div className="listing-thumbs">
          {photos.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              className={i === index ? 'listing-thumb is-active' : 'listing-thumb'}
              onClick={() => setIndex(i)}
              aria-label={t.listing.photoOf(i + 1, count)}
              aria-current={i === index ? 'true' : undefined}
            >
              <ListingImage src={src} alt="" width={80} height={60} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpecTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="listing-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MarketPanel({
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
  if (loading) return <p className="listing-muted">{t.card.marketLoading}</p>;
  if (!market || market.samples === 0) {
    return <p className="listing-muted">{t.card.marketEmpty}</p>;
  }
  const yearLabel = data.year ?? t.card.yearNa;
  const band =
    market.p25 != null && market.p75 != null
      ? t.card.marketBand(madFmt.format(market.p25), madFmt.format(market.p75), market.samples)
      : t.card.marketSamples(market.samples);
  const position = marketBandPosition(data.priceMAD, market.p25, market.p75);

  return (
    <div className="listing-market">
      <p className="listing-market-title">
        {t.card.marketTitle(data.model, yearLabel)}
        <span> · {band}</span>
      </p>
      {position && (
        <p className={`listing-verdict listing-verdict-${position}`}>
          {position === 'below'
            ? t.listing.belowMarket
            : position === 'above'
              ? t.listing.aboveMarket
              : t.listing.inMarket}
        </p>
      )}
      {market.p25 != null && market.p75 != null && (
        <MarketRangeBar price={data.priceMAD} p25={market.p25} median={market.median} p75={market.p75} />
      )}
      {market.median != null && (
        <p className="listing-muted">
          {t.card.marketThisListing(madFmt.format(data.priceMAD), madFmt.format(market.median))}
        </p>
      )}
      {market.events.length > 1 && <Sparkline events={market.events} />}
    </div>
  );
}

function marketBandPosition(
  price: number,
  p25: number | null,
  p75: number | null,
): 'below' | 'in' | 'above' | null {
  if (p25 == null || p75 == null) return null;
  if (price < p25) return 'below';
  if (price > p75) return 'above';
  return 'in';
}

function MarketRangeBar({
  price,
  p25,
  median,
  p75,
}: {
  price: number;
  p25: number;
  median: number | null;
  p75: number;
}) {
  const lo = Math.min(price, p25);
  const hi = Math.max(price, p75);
  const span = Math.max(1, hi - lo);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));
  return (
    <div className="listing-range" aria-hidden="true">
      <div className="listing-range-track">
        <span
          className="listing-range-band"
          style={{ left: `${pct(p25)}%`, width: `${Math.max(2, pct(p75) - pct(p25))}%` }}
        />
        {median != null ? <span className="listing-range-median" style={{ left: `${pct(median)}%` }} /> : null}
        <span className="listing-range-pin" style={{ left: `${pct(price)}%` }} />
      </div>
      <div className="listing-range-labels">
        <span>{madFmt.format(p25)}</span>
        {median != null ? <span>{madFmt.format(median)}</span> : <span />}
        <span>{madFmt.format(p75)}</span>
      </div>
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
  const w = 360;
  const h = 56;
  const pts = prices
    .map((p, i) => {
      const x = prices.length === 1 ? w / 2 : (i / (prices.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="listing-spark" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function conditionChips(data: DealCardData, t: ReturnType<typeof useT>): string[] {
  const chips: string[] = [];
  if (data.firstOwner) chips.push(t.card.firstOwner);
  if (data.ww) chips.push(t.card.ww);
  if (data.customsCleared) chips.push(t.card.customsCleared);
  if (data.accidented === true) chips.push(t.card.accidented);
  if (data.accidented === false) chips.push(t.card.neverAccidented);
  return chips;
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
