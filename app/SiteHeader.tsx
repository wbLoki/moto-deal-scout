import Link from 'next/link';
import { auth } from '../auth.js';
import { signOutAction } from './auth-actions.js';
import { MotoIcon } from './icons.js';

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
        <Link href="/profile">Profile</Link>
        <Link href="/requests">Model requests</Link>
        {user?.role === 'admin' && <Link href="/admin">Admin</Link>}
        {user && (
          <>
            <span className="site-user">{user.email}</span>
            <form action={signOutAction}>
              <button className="btn btn-small" type="submit">
                Log out
              </button>
            </form>
          </>
        )}
      </nav>
    </header>
  );
}
