import { dictionaryFor } from './dictionaries.js';
import type { Dictionary } from './en.js';
import type { Locale } from './locales.js';

/**
 * Dictionary for a locale passed in from a Server Component.
 * Streamed client islands cannot see layout React context during SSR, so
 * callers must pass `locale` rather than reading it from a provider.
 */
export function useT(locale: Locale): Dictionary {
  return dictionaryFor(locale);
}
