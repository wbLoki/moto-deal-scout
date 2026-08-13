'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Header link that sets `aria-current="page"` on the active route. */
export function NavLink({
  href,
  children,
  className,
  'aria-label': ariaLabel,
  title,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  title?: string;
}) {
  const pathname = usePathname();
  const current = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      title={title}
      aria-current={current ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
