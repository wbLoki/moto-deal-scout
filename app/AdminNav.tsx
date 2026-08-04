import Link from 'next/link';

/** Sub-navigation shown at the top of the admin pages. */
export function AdminNav({ active }: { active: 'models' | 'analytics' }) {
  return (
    <nav className="admin-nav">
      <Link
        href="/admin"
        className={active === 'models' ? 'admin-nav-link active' : 'admin-nav-link'}
      >
        Models
      </Link>
      <Link
        href="/admin/analytics"
        className={active === 'analytics' ? 'admin-nav-link active' : 'admin-nav-link'}
      >
        Analytics
      </Link>
    </nav>
  );
}
