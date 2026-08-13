import { cookies, headers } from 'next/headers';
import { dictionaryFor } from './dictionaries.js';
import type { Dictionary } from './en.js';
import {
  DEFAULT_LOCALE,
  isLocale,
  localeFromAcceptLanguage,
  LOCALE_COOKIE,
  type Locale,
} from './locales.js';

export { dictionaryFor };

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const header = (await headers()).get('accept-language') ?? '';
  return localeFromAcceptLanguage(header) || DEFAULT_LOCALE;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaryFor(await getLocale());
}
