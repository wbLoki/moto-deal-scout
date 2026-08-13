import { Suspense, type ReactNode } from 'react';
import { SiteHeader } from './SiteHeader.js';
import { getDictionary } from './i18n/getLocale.js';

/** Shared chrome: streams the header in parallel with the page body. */
export async function PageShell({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const t = await getDictionary();
  const loading = fallback ?? <p className="subtitle">{t.common.loading}</p>;
  return (
    <main className="container">
      <Suspense fallback={<header className="site-header" aria-hidden />}>
        <SiteHeader />
      </Suspense>
      <Suspense fallback={loading}>{children}</Suspense>
    </main>
  );
}
