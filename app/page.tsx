import { redirect } from 'next/navigation';
import { auth } from '../auth.js';
import { getDashboardData } from '../src/readModel.js';
import type { ScoredListing } from '../src/domain/entities/ScoredListing.js';
import { dealTier } from '../src/domain/services/dealTier.js';
import { SearchSettings } from './SearchSettings.js';
import { ScanNowButton } from './ScanNowButton.js';
import { SiteHeader } from './SiteHeader.js';
import { DealTabs, type DealView } from './DealTabs.js';

// Reads the database on each request, so it must run on the Node runtime
// and never be statically cached. maxDuration covers the admin "Scan now".
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function toView(scored: ScoredListing): DealView {
  const { listing, score, match } = scored;
  const tier = dealTier(score.total);
  return {
    key: `${listing.sourceId}:${listing.externalId}`,
    brand: match.criteria.brand,
    model: match.criteria.model,
    priceMAD: listing.priceMAD,
    year: listing.year ?? null,
    mileageKm: listing.mileageKm ?? null,
    city: listing.city,
    sourceId: listing.sourceId,
    url: listing.url,
    imageUrl: listing.imageUrl ?? null,
    matchConfidence: match.confidence,
    score: score.total,
    tierLabel: tier.label,
    tierLevel: tier.level,
  };
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
        Listings across {criteria.models.length} tracked model
        {criteria.models.length === 1 ? '' : 's'}, tagged by how good the deal is (price, mileage,
        year and city). Best deals first.
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

      <DealTabs
        daily={dailyDeals.map(toView)}
        watched={watchedDeals.map(toView)}
        all={allDeals.map(toView)}
        followsAnyModel={watchedModelIds.length > 0}
        hiddenByRange={hiddenByRange}
      />

      <div className="footer">
        Data scraped from Avito.ma, Biker.ma and Moteur.ma. Prices can contain seller typos — always
        verify on the listing before acting.
      </div>
    </main>
  );
}
