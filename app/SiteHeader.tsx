import Link from 'next/link';
import { auth } from '../auth.js';
import { signOutAction } from './auth-actions.js';
import { BellIcon, MotoIcon } from './icons.js';

/** Top bar: brand, nav (Admin link for admins), the signed-in email, and logout. */
export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <MotoIcon size={22} />
        Moto Deal Scout
      </Link>
      <nav className="site-nav">
        {user ? (
          <>
            <Link href="/notifications" aria-label="Notifications" title="Notifications">
              <BellIcon size={18} />
            </Link>
            <Link href="/profile">Profile</Link>
            <Link href="/requests">Model requests</Link>
            {user.role === 'admin' && <Link href="/admin">Admin</Link>}
            <span className="site-user">{user.email}</span>
            <form action={signOutAction}>
              <button className="btn btn-small" type="submit">
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className="btn btn-small">
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-small">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
