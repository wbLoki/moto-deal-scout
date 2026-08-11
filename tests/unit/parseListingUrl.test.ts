import { describe, expect, it } from 'vitest';
import {
  extractListingUrl,
  isUrlOnlyPaste,
  parseListingUrl,
} from '../../src/application/services/parseListingUrl.js';

describe('parseListingUrl', () => {
  it('parses an Avito listing URL', () => {
    expect(
      parseListingUrl(
        'https://www.avito.ma/fr/casablanca/motos/yamaha_mt_07_2020_123456789.htm',
      ),
    ).toEqual({
      sourceId: 'avito',
      externalId: '123456789',
      url: 'https://www.avito.ma/fr/casablanca/motos/yamaha_mt_07_2020_123456789.htm',
    });
  });

  it('parses a Biker.ma listing URL', () => {
    expect(
      parseListingUrl('https://www.biker.ma/annonce/detail-moto/yamaha-mt-07/98765'),
    ).toEqual({
      sourceId: 'biker',
      externalId: '98765',
      url: 'https://www.biker.ma/annonce/detail-moto/yamaha-mt-07/98765',
    });
  });

  it('rejects unrelated hosts', () => {
    expect(parseListingUrl('https://example.com/moto_123.htm')).toBeUndefined();
  });
});

describe('extractListingUrl / isUrlOnlyPaste', () => {
  it('pulls the first marketplace URL out of mixed text', () => {
    const text =
      'See https://www.avito.ma/fr/rabat/motos/honda_cb500f_555.htm please — prix 60k';
    expect(extractListingUrl(text)?.externalId).toBe('555');
    expect(isUrlOnlyPaste(text)).toBe(false);
  });

  it('detects a bare listing link', () => {
    const url = 'https://www.avito.ma/fr/casa/motos/mt07_42.htm';
    expect(isUrlOnlyPaste(url)).toBe(true);
    expect(isUrlOnlyPaste(`  ${url}  `)).toBe(true);
  });
});
