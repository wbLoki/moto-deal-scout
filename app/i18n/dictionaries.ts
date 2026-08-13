import { en, type Dictionary } from './en.js';
import { fr } from './fr.js';
import type { Locale } from './locales.js';

export function dictionaryFor(locale: Locale): Dictionary {
  return locale === 'fr' ? fr : en;
}
