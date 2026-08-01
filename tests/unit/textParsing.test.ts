import { describe, expect, it } from 'vitest';
import {
  parseNumber,
  parseRelativeFrenchDate,
  parseYear,
  slugifyForAvito,
  slugifyWithHyphens,
} from '../../src/infrastructure/sources/shared/textParsing.js';

describe('parseNumber', () => {
  it('parses space-separated thousands', () => {
    expect(parseNumber('25 000')).toBe(25000);
  });

  it('parses comma-separated thousands', () => {
    expect(parseNumber('25,000')).toBe(25000);
  });

  it('strips units like km or DH', () => {
    expect(parseNumber('19 000 km')).toBe(19000);
    expect(parseNumber('70 000 DH')).toBe(70000);
  });

  it('returns undefined for text with no digits', () => {
    expect(parseNumber('Demander le prix')).toBeUndefined();
    expect(parseNumber(undefined)).toBeUndefined();
    expect(parseNumber(null)).toBeUndefined();
  });
});

describe('parseYear', () => {
  it('extracts a 4-digit year from surrounding text', () => {
    expect(parseYear('Année-Modèle 2019')).toBe(2019);
  });

  it('returns undefined when no plausible year is present', () => {
    expect(parseYear('19 000 km')).toBeUndefined();
    expect(parseYear(undefined)).toBeUndefined();
  });
});

describe('parseRelativeFrenchDate', () => {
  const now = new Date('2024-06-15T12:00:00Z');

  it('parses "il y a X heures"', () => {
    const result = parseRelativeFrenchDate('il y a 3 heures', now);
    expect(result?.toISOString()).toBe('2024-06-15T09:00:00.000Z');
  });

  it('parses "il y a X jours"', () => {
    const result = parseRelativeFrenchDate('il y a 2 jours', now);
    expect(result?.toISOString()).toBe('2024-06-13T12:00:00.000Z');
  });

  it('parses "aujourd\'hui" as now', () => {
    expect(parseRelativeFrenchDate("aujourd'hui", now)).toEqual(now);
  });

  it('parses "hier" as 24h ago', () => {
    const result = parseRelativeFrenchDate('hier', now);
    expect(result?.toISOString()).toBe('2024-06-14T12:00:00.000Z');
  });

  it('returns undefined for unrecognized text', () => {
    expect(parseRelativeFrenchDate('Publié le 12-01-2024', now)).toBeUndefined();
    expect(parseRelativeFrenchDate(undefined, now)).toBeUndefined();
  });
});

describe('slugifyForAvito', () => {
  it('lowercases and joins with underscores', () => {
    expect(slugifyForAvito('MT-07')).toBe('mt_07');
    expect(slugifyForAvito('Yamaha MT-07')).toBe('yamaha_mt_07');
  });
});

describe('slugifyWithHyphens', () => {
  it('lowercases and joins with hyphens', () => {
    expect(slugifyWithHyphens('YAMAHA MT-07')).toBe('yamaha-mt-07');
  });
});
