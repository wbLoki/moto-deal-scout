import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage } from '../../app/i18n/locales.js';

describe('localeFromAcceptLanguage', () => {
  it('maps English tags to en', () => {
    expect(localeFromAcceptLanguage('en')).toBe('en');
    expect(localeFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
    expect(localeFromAcceptLanguage('en-GB')).toBe('en');
  });

  it('maps French, Arabic, and empty headers to fr', () => {
    expect(localeFromAcceptLanguage('fr')).toBe('fr');
    expect(localeFromAcceptLanguage('fr-MA,fr;q=0.9')).toBe('fr');
    expect(localeFromAcceptLanguage('ar-MA,ar;q=0.9,fr;q=0.8')).toBe('fr');
    expect(localeFromAcceptLanguage('')).toBe('fr');
  });
});
