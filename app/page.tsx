import { getDashboardData } from '../src/readModel.js';
import type { ScoredListing } from '../src/domain/entities/ScoredListing.js';

// Reads the database on each request, so it must run on the Node runtime
// and never be statically cached.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatMAD(value: number): string {
  return new Intl.NumberFormat('fr-MA').format(value) + ' MAD';
}

function DealCard({ scored }: { scored: ScoredListing }) {
  const { listing, score, match } = scored;
  return (
    <article className="card">
      {listing.imageUrl ? (
        <img className="card-media" src={listing.imageUrl} alt={listing.title} loading="lazy" />
      ) : (
        <div className="card-media-empty">No image</div>
      )}
      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">
            {match.criteria.brand} {match.criteria.model}
          </h3>
          <span className="score">{score.total}/100</span>
        </div>
        <div className="price">{formatMAD(listing.priceMAD)}</div>
        <div className="meta">
          <span>{listing.year ?? 'Year n/a'}</span>
          <span>{listing.mileageKm !== undefined ? `${listing.mileageKm} km` : 'km n/a'}</span>
          <span>{listing.city}</span>
        </div>
        <div className="badges">
          <span className="badge">{listing.sourceId}</span>
          <span className="badge">match {Math.round(match.confidence * 100)}%</span>
        </div>
        <a className="card-link" href={listing.url} target="_blank" rel="noopener noreferrer">
          View listing →
        </a>
      </div>
    </article>
  );
}

export default async function DashboardPage() {
  const { criteria, goodDeals } = await getDashboardData(60);

  const sources = new Set(goodDeals.map((d) => d.listing.sourceId));
  const topScore = goodDeals.reduce((max, d) => Math.max(max, d.score.total), 0);

  return (
    <main className="container">
      <div className="header">
        <h1 className="title">🏍️ Moto Deal Scout</h1>
      </div>
      <p className="subtitle">
        Good deals across {criteria.models.length} tracked model
        {criteria.models.length === 1 ? '' : 's'}, scored on price, mileage, year and city.
        Threshold: {criteria.global.minScoreForGoodDeal}/100.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{goodDeals.length}</div>
          <div className="stat-label">Good deals</div>
        </div>
        <div className="stat">
          <div className="stat-value">{sources.size}</div>
          <div className="stat-label">Sources</div>
        </div>
        <div className="stat">
          <div className="stat-value">{topScore || '—'}</div>
          <div className="stat-label">Top score</div>
        </div>
      </div>

      {goodDeals.length === 0 ? (
        <div className="empty">
          No good deals stored yet. Trigger a scan (or wait for the daily cron run) and refresh.
        </div>
      ) : (
        <div className="grid">
          {goodDeals.map((deal) => (
            <DealCard key={`${deal.listing.sourceId}:${deal.listing.externalId}`} scored={deal} />
          ))}
        </div>
      )}

      <div className="footer">
        Data scraped from Avito.ma, Biker.ma and Moteur.ma. Prices can contain seller typos — always
        verify on the listing before acting.
      </div>
    </main>
  );
}
