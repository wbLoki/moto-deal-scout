import Link from 'next/link';
import { auth } from '../auth.js';
import { countUnreadNotifications } from '../src/notificationsModel.js';
import { signOutAction } from './auth-actions.js';
import { ThemeToggle } from './ThemeToggle.js';
import { HeaderNav } from './HeaderNav.js';
import { NavLink } from './NavLink.js';
import { UserMenu } from './UserMenu.js';
import { BrandLogo } from './BrandLogo.js';
import { BellIcon, MotoIcon, ShieldIcon, UserIcon } from './icons.js';

/** Top bar: brand, nav (Admin link for admins), the signed-in email, and logout. */
export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;
  const unread = user?.id ? await countUnreadNotifications(user.id) : 0;

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <BrandLogo variant="mark" />
        <span className="brand-name">Moto Deal Scout</span>
      </Link>
      <HeaderNav>
        <li>
          <NavLink href="/compare">
            <MotoIcon size={18} />
            Compare a bike
          </NavLink>
        </li>
        {user ? (
          <>
            <li>
              <NavLink
                href="/notifications"
                className="notif-bell"
                aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
                title="Notifications"
              >
                <span className="notif-bell-icon">
                  <BellIcon size={18} />
                  {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
                </span>
                <span className="nav-text">Notifications</span>
              </NavLink>
            </li>
            <li className="nav-desktop-only">
              <UserMenu
                email={user.email ?? ''}
                isAdmin={user.role === 'admin'}
                signOutAction={signOutAction}
              />
            </li>
            <li className="nav-mobile-only">
              <NavLink href="/profile">
                <UserIcon size={18} />
                Profile
              </NavLink>
            </li>
            <li className="nav-mobile-only">
              <NavLink href="/requests">Model requests</NavLink>
            </li>
            {user.role === 'admin' && (
              <li className="nav-mobile-only">
                <NavLink href="/admin">
                  <ShieldIcon size={18} />
                  Admin
                </NavLink>
              </li>
            )}
            <li className="nav-theme">
              <ThemeToggle />
            </li>
            <li className="nav-mobile-only nav-signout-item">
              <form action={signOutAction}>
                <button type="submit" className="nav-signout">
                  Log out
                </button>
              </form>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link href="/login" className="btn btn-small">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/signup" className="btn btn-primary btn-small">
                Create account
              </Link>
            </li>
            <li className="nav-theme">
              <ThemeToggle />
            </li>
          </>
        )}
      </HeaderNav>
    </header>
  );
}
