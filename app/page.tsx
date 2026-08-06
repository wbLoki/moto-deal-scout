import { redirect } from 'next/navigation';
import { auth } from '../auth.js';
import { getDashboardData, getPublicDeals } from '../src/readModel.js';
import type { ScoredListing } from '../src/domain/entities/ScoredListing.js';
import { dealTierFor } from '../src/domain/services/dealTier.js';
import { isCalibrated } from '../src/domain/services/calibrationState.js';
import { PublicHome } from './PublicHome.js';
import { SearchSettings } from './SearchSettings.js';
import { ScanNowButton } from './ScanNowButton.js';
import { SiteHeader } from './SiteHeader.js';
import { DealTabs, type DealView } from './DealTabs.js';
import type { DealCardData } from './DealCardShell.js';

// Reads the database on each request, so it must run on the Node runtime
// and never be statically cached. maxDuration covers the admin "Scan now".
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function toView(scored: ScoredListing): DealView {
  const { listing, score, match } = scored;
  const tier = dealTierFor(score.total, isCalibrated(match.criteria));
  return {
    key: `${listing.sourceId}:${listing.externalId}`,
    modelId: match.criteria.id,
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
    createdAt: listing.firstSeenAt ?? listing.scrapedAt.toISOString(),
    tierLabel: tier.label,
    tierLevel: tier.level,
  };
}

function toPublicDeal(scored: ScoredListing): DealCardData {
  const { listing, score, match } = scored;
  const tier = dealTierFor(score.total, isCalibrated(match.criteria));
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
    score: score.total,
    createdAt: listing.firstSeenAt ?? listing.scrapedAt.toISOString(),
    tierLabel: tier.label,
    tierLevel: tier.level,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  // Anonymous visitors can browse the full public deal feed (no login required).
  if (!session?.user?.id) {
    const deals = await getPublicDeals();
    return <PublicHome deals={deals.map(toPublicDeal)} />;
  }
  const isAdmin = session.user.role === 'admin';

  const data = await getDashboardData(session.user.id);
  if (!data.onboarded) redirect('/onboarding');

  const { criteria, allDeals, dailyDeals, watchedModelIds, savedDeals, searchRange } = data;
  const hiddenByRange = data.totalBeforeFilter - allDeals.length;
  const savedKeys = savedDeals.map((d) => `${d.listing.sourceId}:${d.listing.externalId}`);

  return (
    <main className="container">
      <SiteHeader />

      <p className="subtitle">
        Listings across {criteria.models.length} tracked model
        {criteria.models.length === 1 ? '' : 's'}, tagged by how good the deal is (price, mileage,
        year and city). Best deals first.
      </p>

      <DealTabs
        daily={dailyDeals.map(toView)}
        all={allDeals.map(toView)}
        saved={savedDeals.map(toView)}
        watchedModelIds={watchedModelIds}
        savedKeys={savedKeys}
        hiddenByRange={hiddenByRange}
        sidebar={
          <>
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
          </>
        }
      />

      <div className="footer">
        Data scraped from Avito.ma and Biker.ma. Prices can contain seller typos — always
        verify on the listing before acting.
      </div>
    </main>
  );
}
