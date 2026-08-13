export const LOCALES = ['en', 'fr'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';

export const LOCALE_COOKIE = 'locale';

export function isLocale(value: string | undefined): value is Locale {
  return value === 'en' || value === 'fr';
}

/**
 * First Accept-Language tag wins. English (`en`, `en-US`, …) stays English;
 * everything else — including `fr-MA` and `ar` — maps to French for Morocco.
 */
export function localeFromAcceptLanguage(header: string): Locale {
  const first = header.split(',')[0]?.trim().split(';')[0]?.trim().toLowerCase() ?? '';
  if (first === 'en' || first.startsWith('en-')) return 'en';
  return DEFAULT_LOCALE;
}
