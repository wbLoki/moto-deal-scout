import { redirect } from 'next/navigation';
import { auth } from '../../../auth.js';
import { getAdminMetrics, type LabeledCount } from '../../../src/adminMetrics.js';
import { AdminNav } from '../../AdminNav.js';
import { SiteHeader } from '../../SiteHeader.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** A horizontal bar list; bars are sized relative to the largest count. */
function BarList({ rows, empty }: { rows: readonly LabeledCount[]; empty: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="bar-count">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const m = await getAdminMetrics();

  return (
    <main className="container">
      <SiteHeader />
      <h1 className="title">Admin · Analytics</h1>
      <AdminNav active="analytics" />

      <div className="stats">
        <Stat value={m.users.total} label="Total users" />
        <Stat value={m.users.new24h} label="New · 24h" />
        <Stat value={m.users.new7d} label="New · 7d" />
        <Stat value={m.users.admins} label="Admins" />
      </div>

      <div className="stats">
        <Stat value={m.users.withWatchlist} label="With a watchlist" />
        <Stat value={m.users.onboarded} label="Onboarded" />
        <Stat value={m.users.withCustomRange} label="Custom budget" />
        <Stat value={m.watchlist.totalFollows} label="Total follows" />
      </div>

      <section className="admin-section">
        <h2 className="settings-title">New sign-ups per day</h2>
        <BarList
          rows={m.users.signupsByDay.map((d) => ({ label: d.day, count: d.count }))}
          empty="No sign-ups yet."
        />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Sign-up method</h2>
        <p className="settings-hint">
          Where accounts come from. Visitor traffic and geography live in the Vercel Analytics
          dashboard.
        </p>
        <BarList
          rows={[
            { label: 'Email + password', count: m.users.byMethod.password },
            { label: 'Social (OAuth)', count: m.users.byMethod.social },
          ]}
          empty="No users yet."
        />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Most followed models</h2>
        <BarList rows={m.watchlist.topModels} empty="No models followed yet." />
      </section>

      <div className="stats">
        <Stat value={m.requests.total} label="Model requests" />
        <Stat value={m.requests.pending} label="Pending" />
        <Stat value={m.requests.approved} label="Approved" />
        <Stat value={m.requests.rejected} label="Rejected" />
      </div>

      <div className="stats">
        <Stat value={m.listings.total} label="Listings stored" />
        <Stat value={m.listings.goodDeals} label="Good deals" />
      </div>

      <section className="admin-section">
        <h2 className="settings-title">Listings by source</h2>
        <BarList rows={m.listings.bySource} empty="No listings yet." />
      </section>
    </main>
  );
}
