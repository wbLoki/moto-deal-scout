import Link from 'next/link';

const TABS = [
  { id: 'models', label: 'Models', href: '/admin' },
  { id: 'users', label: 'Users', href: '/admin/users' },
  { id: 'analytics', label: 'Analytics', href: '/admin/analytics' },
] as const;

/** Sub-navigation shown at the top of the admin pages. */
export function AdminNav({ active }: { active: 'models' | 'users' | 'analytics' }) {
  return (
    <nav className="admin-nav">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={t.id === active ? 'admin-nav-link active' : 'admin-nav-link'}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
