import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { isCarMarketplace } from '../../src/domain/entities/Listing.js';
import { loadNotificationsPage } from '../../src/notificationsModel.js';
import { ListingImage } from '../ListingImage.js';
import { PageShell } from '../PageShell.js';
import { getDictionary } from '../i18n/getLocale.js';
import type { Dictionary } from '../i18n/en.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });

function whenLabel(iso: string, t: Dictionary): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return t.notifications.justNow;
  if (mins < 60) return t.notifications.minutesAgo(mins);
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t.notifications.hoursAgo(hrs);
  return t.notifications.daysAgo(Math.round(hrs / 24));
}

export default function NotificationsPage() {
  return (
    <PageShell>
      <NotificationsBody />
    </PageShell>
  );
}

async function NotificationsBody() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const items = await loadNotificationsPage(session.user.id);
  const t = await getDictionary();

  return (
    <>
      <h1 className="title">{t.notifications.title}</h1>
      <p className="subtitle">
        {t.notifications.subtitleLead}
        <Link className="card-link" href="/profile">
          {t.nav.profile}
        </Link>
        {t.notifications.subtitleTail}
      </p>

      {items.length === 0 ? (
        <div className="empty">{t.notifications.empty}</div>
      ) : (
        <ul className="notif-list">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? 'notif' : 'notif unread'}>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="notif-link">
                {n.imageUrl ? (
                  <ListingImage
                    className="notif-img"
                    src={n.imageUrl}
                    alt=""
                    width={64}
                    height={48}
                  />
                ) : (
                  <div className="notif-img notif-img-empty" />
                )}
                <div className="notif-body">
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-meta">
                    {n.type === 'price_drop'
                      ? n.oldPriceMAD
                        ? t.notifications.priceDropFrom(madFmt.format(n.oldPriceMAD))
                        : t.notifications.priceDrop
                      : t.notifications.newDeal}{' '}
                    · {whenLabel(n.createdAt, t)}
                    {' · '}
                    <Link href={isCarMarketplace(n.sourceId) ? '/cars' : '/'} className="card-link">
                      {isCarMarketplace(n.sourceId) ? t.nav.cars : t.nav.motos}
                    </Link>
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
