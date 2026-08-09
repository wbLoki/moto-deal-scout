import { Suspense, type ReactNode } from 'react';
import { SiteHeader } from './SiteHeader.js';

/** Shared chrome: streams the header in parallel with the page body. */
export function PageShell({
  children,
  fallback = <p className="subtitle">Loading…</p>,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <main className="container">
      <Suspense fallback={<header className="site-header" aria-hidden />}>
        <SiteHeader />
      </Suspense>
      <Suspense fallback={fallback}>{children}</Suspense>
    </main>
  );
}
