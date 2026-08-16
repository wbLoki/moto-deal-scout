import { redirect } from 'next/navigation';
import { auth } from '../auth.js';
import { getDashboardData, getPublicDashboard } from '../src/readModel.js';
import { PublicHome } from './PublicHome.js';
import { DealTabs } from './DealTabs.js';
import { toDealView } from './dealView.js';
import { PageShell } from './PageShell.js';
import { dictionaryFor, getLocale } from './i18n/getLocale.js';

// Reads the database on each request, so it must run on the Node runtime
// and never be statically cached.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default function DashboardPage() {
  return (
    <PageShell>
      <HomeBody />
    </PageShell>
  );
}

async function HomeBody() {
  const session = await auth();
  // Anonymous visitors can browse the full public deal feed (no login required).
  if (!session?.user?.id) {
    const pub = await getPublicDashboard();
    return (
      <PublicHome
        initialDeals={pub.initialDeals.map(toDealView)}
        initialTotal={pub.initialTotal}
        initialSort={pub.initialSort}
        facets={pub.facets}
      />
    );
  }
  const data = await getDashboardData(session.user.id);
  if (!data.onboarded) redirect('/onboarding');

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
      />

      <div className="footer">{t.home.footer}</div>
    </>
  );
}
