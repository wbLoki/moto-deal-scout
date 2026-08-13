'use client';

import { usePathname } from 'next/navigation';
import { NavLink } from './NavLink.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

/** Model-requests link that follows the Motos / Cars section. */
export function RequestsNavLink({ locale }: { locale: Locale }) {
  const t = useT(locale);
  const pathname = usePathname();
  const onCars = pathname === '/cars' || pathname.startsWith('/cars/');
  return <NavLink href={onCars ? '/cars/requests' : '/requests'}>{t.nav.requests}</NavLink>;
}
