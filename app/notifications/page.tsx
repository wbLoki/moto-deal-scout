import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { listUserNotifications, markAllNotificationsRead } from '../../src/notificationsModel.js';
import { SiteHeader } from '../SiteHeader.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

function whenLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  // Read the list first (so unread styling reflects state on arrival), then
  // clear the unread flag so the header bell resets on this render.
  const items = await listUserNotifications(session.user.id);
  await markAllNotificationsRead(session.user.id);

  return (
    <main className="container">
      <SiteHeader />
      <h1 className="title">Notifications</h1>
      <p className="subtitle">
        Alerts for the models you follow. Follow more on your{' '}
        <a className="card-link" href="/profile">
          profile
        </a>
        .
      </p>

      {items.length === 0 ? (
        <div className="empty">
          No notifications yet — follow some models and we&apos;ll alert you when a matching deal
          appears.
        </div>
      ) : (
        <ul className="notif-list">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? 'notif' : 'notif unread'}>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="notif-link">
                {n.imageUrl ? (
                  <img className="notif-img" src={n.imageUrl} alt="" loading="lazy" />
                ) : (
                  <div className="notif-img notif-img-empty" />
                )}
                <div className="notif-body">
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-meta">
                    {n.type === 'price_drop'
                      ? `Price drop${n.oldPriceMAD ? ` from ${madFmt.format(n.oldPriceMAD)} MAD` : ''}`
                      : 'New deal for a model you follow'}{' '}
                    · {whenLabel(n.createdAt)}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
