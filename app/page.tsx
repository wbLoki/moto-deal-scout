import { redirect } from 'next/navigation';
import { auth } from '../auth.js';
import { getDashboardData } from '../src/readModel.js';
import type { ScoredListing } from '../src/domain/entities/ScoredListing.js';
import { SearchSettings } from './SearchSettings.js';
import { ScanNowButton } from './ScanNowButton.js';
import { SiteHeader } from './SiteHeader.js';

// Reads the database on each request, so it must run on the Node runtime
// and never be statically cached. maxDuration covers the admin "Scan now".
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const isAdmin = session.user.role === 'admin';

  const { criteria, goodDeals, searchRange, totalBeforeFilter } = await getDashboardData(
    session.user.id,
  );

  const sources = new Set(goodDeals.map((d) => d.listing.sourceId));
  const topScore = goodDeals.reduce((max, d) => Math.max(max, d.score.total), 0);
  const hiddenByRange = totalBeforeFilter - goodDeals.length;

  return (
    <main className="container">
      <SiteHeader />

      <p className="subtitle">
        Good deals across {criteria.models.length} tracked model
        {criteria.models.length === 1 ? '' : 's'}, scored on price, mileage, year and city.
        Threshold: {criteria.global.minScoreForGoodDeal}/100.
        {isAdmin && ' You are an admin.'}
      </p>

      <SearchSettings current={searchRange} />
      {isAdmin && <ScanNowButton />}

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{goodDeals.length}</div>
          <div className="stat-label">In your range</div>
        </div>
        <div className="stat">
          <div className="stat-value">{sources.size}</div>
          <div className="stat-label">Sources</div>
        </div>
        <div className="stat">
          <div className="stat-value">{topScore || '—'}</div>
          <div className="stat-label">Top score</div>
        </div>
        <div className="stat">
          <div className="stat-value">{hiddenByRange > 0 ? hiddenByRange : '—'}</div>
          <div className="stat-label">Outside range</div>
        </div>
      </div>

      {goodDeals.length === 0 ? (
        <div className="empty">
          No good deals in your range yet. Widen your budget/year above
          {totalBeforeFilter > 0 ? ` (${totalBeforeFilter} exist outside it)` : ''}, or wait for the
          next daily scan.
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
