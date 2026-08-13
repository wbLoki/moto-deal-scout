'use server';

import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from './locales.js';

/** Persists the UI language for a year. The client then refreshes the RSC tree. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
