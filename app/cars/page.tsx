import { auth } from '../../auth.js';
import { getDashboardData, getPublicDashboard } from '../../src/readModel.js';
import { PublicHome } from '../PublicHome.js';
import { SearchSettings } from '../SearchSettings.js';
import { ScanNowButton } from '../ScanNowButton.js';
import { DealTabs } from '../DealTabs.js';
import { toDealView } from '../dealView.js';
import { PageShell } from '../PageShell.js';
import { dictionaryFor, getLocale } from '../i18n/getLocale.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default function CarsPage() {
  return (
    <PageShell>
      <CarsBody />
    </PageShell>
  );
}

async function CarsBody() {
  const session = await auth();
  if (!session?.user?.id) {
    const pub = await getPublicDashboard('car');
    return (
      <PublicHome
        initialDeals={pub.initialDeals.map(toDealView)}
        initialTotal={pub.initialTotal}
        initialSort={pub.initialSort}
        facets={pub.facets}
        vehicleType="car"
      />
    );
  }
  const isAdmin = session.user.role === 'admin';
  const data = await getDashboardData(session.user.id, 'car');
  const locale = await getLocale();
  const t = dictionaryFor(locale);

  const { criteria, facets, tabCounts, initialTab, initialSort, savedSearchCount, searchRange } =
    data;

  return (
    <>
      <p className="subtitle">{t.home.trackedModels(criteria.models.length)}</p>

      <DealTabs
        initialDeals={data.initialDeals.map(toDealView)}
        initialTotal={data.initialTotal}
        initialTab={initialTab}
        initialSort={initialSort}
        tabCounts={tabCounts}
        facets={facets}
        savedSearchCount={savedSearchCount}
        savedKeys={data.savedKeys}
        searchRange={searchRange}
        locale={locale}
        vehicleType="car"
        sidebar={
          <>
            <SearchSettings locale={locale} current={searchRange} vehicleType="car" />
            {isAdmin ? (
              <ScanNowButton />
            ) : (
              <div className="scan-now">
                <button className="btn" type="button" disabled title={t.home.scanSoonTitle}>
                  {t.home.scanNow}
                </button>
                <span className="status-pill">{t.home.comingSoon}</span>
              </div>
            )}
          </>
        }
      />

      <div className="footer">{t.home.footer}</div>
    </>
  );
}
