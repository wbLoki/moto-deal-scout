import type { ReactNode } from 'react';
import Link from 'next/link';
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

function DealSection({
  title,
  deals,
  emptyNote,
}: {
  title: string;
  deals: readonly ScoredListing[];
  emptyNote: ReactNode;
}) {
  return (
    <section className="deal-section">
      <div className="deal-section-head">
        <h2>{title}</h2>
        <span className="deal-section-count">{deals.length}</span>
      </div>
      {deals.length === 0 ? (
        <div className="empty">{emptyNote}</div>
      ) : (
        <div className="grid">
          {deals.map((deal) => (
            <DealCard key={`${deal.listing.sourceId}:${deal.listing.externalId}`} scored={deal} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const isAdmin = session.user.role === 'admin';

  const data = await getDashboardData(session.user.id);
  if (!data.onboarded) redirect('/onboarding');

  const { criteria, allDeals, dailyDeals, watchedDeals, watchedModelIds, searchRange } = data;
  const hiddenByRange = data.totalBeforeFilter - allDeals.length;

  return (
    <main className="container">
      <SiteHeader />

      <p className="subtitle">
        Good deals across {criteria.models.length} tracked model
        {criteria.models.length === 1 ? '' : 's'}, scored on price, mileage, year and city.
        Threshold: {criteria.global.minScoreForGoodDeal}/100.
      </p>

      <SearchSettings current={searchRange} />
      {isAdmin ? (
        <ScanNowButton />
      ) : (
        <div className="scan-now">
          <button
            className="btn"
            type="button"
            disabled
            title="On-demand scans are coming soon for members."
          >
            Scan now
          </button>
          <span className="status-pill">Coming soon</span>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{dailyDeals.length}</div>
          <div className="stat-label">New today</div>
        </div>
        <div className="stat">
          <div className="stat-value">{watchedDeals.length}</div>
          <div className="stat-label">Watched</div>
        </div>
        <div className="stat">
          <div className="stat-value">{allDeals.length}</div>
          <div className="stat-label">In your range</div>
        </div>
        <div className="stat">
          <div className="stat-value">{hiddenByRange > 0 ? hiddenByRange : '—'}</div>
          <div className="stat-label">Outside range</div>
        </div>
      </div>

      <DealSection
        title="Daily deals"
        deals={dailyDeals}
        emptyNote="No new deals found today yet — the daily scan runs each morning."
      />

      <DealSection
        title="Your watched models"
        deals={watchedDeals}
        emptyNote={
          watchedModelIds.length === 0 ? (
            <>
              You&apos;re not following any models yet. Pick some on your{' '}
              <Link href="/profile" className="card-link">
                profile
              </Link>
              .
            </>
          ) : (
            'No deals for your followed models in range right now.'
          )
        }
      />

      <DealSection
        title="All deals"
        deals={allDeals}
        emptyNote={
          <>
            No good deals in your range yet. Widen your budget/year above
            {data.totalBeforeFilter > 0 ? ` (${data.totalBeforeFilter} exist outside it)` : ''}, or
            wait for the next daily scan.
          </>
        }
      />

      <div className="footer">
        Data scraped from Avito.ma, Biker.ma and Moteur.ma. Prices can contain seller typos — always
        verify on the listing before acting.
      </div>
    </main>
  );
}
