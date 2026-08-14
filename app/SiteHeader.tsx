import Link from 'next/link';
import { auth } from '../auth.js';
import { countUnreadNotifications } from '../src/notificationsModel.js';
import { signOutAction } from './auth-actions.js';
import { ThemeToggle } from './ThemeToggle.js';
import { HeaderNav } from './HeaderNav.js';
import { NavLink } from './NavLink.js';
import { UserMenu } from './UserMenu.js';
import { BrandLogo } from './BrandLogo.js';
import { CompareNavLink } from './CompareNavLink.js';
import { RequestsNavLink } from './RequestsNavLink.js';
import { BellIcon, ShieldIcon, UserIcon } from './icons.js';
import { dictionaryFor, getLocale } from './i18n/getLocale.js';
import { LocaleSwitcher } from './i18n/LocaleSwitcher.js';

/** Top bar: brand, nav (Admin link for admins), the signed-in email, and logout. */
export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;
  const unread = user?.id ? await countUnreadNotifications(user.id) : 0;
  const locale = await getLocale();
  const t = dictionaryFor(locale);

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <BrandLogo variant="mark" />
        <span className="brand-name">Moto Deal Scout</span>
      </Link>
      <HeaderNav locale={locale}>
        <li>
          <NavLink href="/">{t.nav.motos}</NavLink>
        </li>
        <li>
          <NavLink href="/cars">{t.nav.cars}</NavLink>
        </li>
        <li>
          <CompareNavLink locale={locale} />
        </li>
        {user ? (
          <>
            <li>
              <NavLink
                href="/notifications"
                className="notif-bell"
                aria-label={unread > 0 ? t.nav.notificationsUnread(unread) : t.nav.notifications}
                title={t.nav.notifications}
              >
                <span className="notif-bell-icon">
                  <BellIcon size={18} />
                  {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
                </span>
                <span className="nav-text">{t.nav.notifications}</span>
              </NavLink>
            </li>
            <li className="nav-desktop-only">
              <UserMenu
                email={user.email ?? ''}
                isAdmin={user.role === 'admin'}
                locale={locale}
                signOutAction={signOutAction}
              />
            </li>
            <li className="nav-mobile-only">
              <NavLink href="/profile">
                <UserIcon size={18} />
                {t.nav.profile}
              </NavLink>
            </li>
            <li className="nav-mobile-only">
              <RequestsNavLink locale={locale} />
            </li>
            {user.role === 'admin' && (
              <li className="nav-mobile-only">
                <NavLink href="/admin">
                  <ShieldIcon size={18} />
                  {t.nav.admin}
                </NavLink>
              </li>
            )}
            <li className="nav-theme">
              <LocaleSwitcher locale={locale} />
              <ThemeToggle locale={locale} />
            </li>
            <li className="nav-mobile-only nav-signout-item">
              <form action={signOutAction}>
                <button type="submit" className="nav-signout">
                  {t.nav.logOut}
                </button>
              </form>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link href="/login" className="btn btn-small">
                {t.nav.signIn}
              </Link>
            </li>
            <li>
              <Link href="/signup" className="btn btn-primary btn-small">
                {t.nav.createAccount}
              </Link>
            </li>
            <li className="nav-theme">
              <LocaleSwitcher locale={locale} />
              <ThemeToggle locale={locale} />
            </li>
          </>
        )}
      </HeaderNav>
    </header>
  );
}
