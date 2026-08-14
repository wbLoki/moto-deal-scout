'use client';

import { usePathname } from 'next/navigation';
import { MotoIcon } from './icons.js';
import { NavLink } from './NavLink.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

/** Compare link that follows the Motos / Cars section. */
export function CompareNavLink({ locale }: { locale: Locale }) {
  const t = useT(locale);
  const pathname = usePathname();
  const onCars = pathname === '/cars' || pathname.startsWith('/cars/');
  return (
    <NavLink href={onCars ? '/cars/compare' : '/compare'}>
      <MotoIcon size={18} />
      {onCars ? t.nav.compareCar : t.nav.compare}
    </NavLink>
  );
}
