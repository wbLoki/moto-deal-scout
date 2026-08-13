import { describe, expect, it } from 'vitest';
import { AvitoSource, buildAvitoUrl } from '../../src/infrastructure/sources/avito/AvitoSource.js';
import { buildBikerUrl } from '../../src/infrastructure/sources/biker/BikerSource.js';
import { buildMoteurUrl } from '../../src/infrastructure/sources/moteur/MoteurSource.js';

describe('buildAvitoUrl', () => {
  it('omits the page cursor on page 1 and adds it after', () => {
    expect(buildAvitoUrl('yamaha_mt_07', 1)).toBe('https://www.avito.ma/fr/maroc/yamaha_mt_07');
    expect(buildAvitoUrl('yamaha_mt_07', 3)).toBe(
      'https://www.avito.ma/fr/maroc/yamaha_mt_07?o=3',
    );
  });

  it('uses the category slug for a browse-all crawl', () => {
    expect(buildAvitoUrl('motos-à_vendre', 2)).toBe(
      'https://www.avito.ma/fr/maroc/motos-à_vendre?o=2',
    );
  });

  it('uses the car category slug for a voitures browse crawl', () => {
    expect(buildAvitoUrl('voitures-à_vendre', 1)).toBe(
      'https://www.avito.ma/fr/maroc/voitures-à_vendre',
    );
  });
});

describe('AvitoSource', () => {
  it('uses sourceId avito-cars for the car category', () => {
    const source = new AvitoSource(
      { fetchRenderedHtml: async () => '' },
      { throttleMs: 0, sourceId: 'avito-cars' },
      { error: () => undefined, warn: () => undefined, info: () => undefined, child: () => ({}) } as never,
    );
    expect(source.id).toBe('avito-cars');
  });
});

describe('buildBikerUrl', () => {
  it('hits the list API with page + limit', () => {
    const url = new URL(buildBikerUrl('MT-07', 1));
    expect(url.pathname).toBe('/api/v1/moto/annonce');
    expect(url.searchParams.get('modele')).toBe('MT-07');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('45');
  });

  it('browses the whole category when the model is empty', () => {
    const url = new URL(buildBikerUrl('', 4));
    expect(url.searchParams.get('modele')).toBeNull();
    expect(url.searchParams.get('page')).toBe('4');
    expect(url.searchParams.get('limit')).toBe('45');
  });
});

describe('buildMoteurUrl', () => {
  it('browses the used-car category, newest first', () => {
    expect(buildMoteurUrl(1)).toBe('https://moteur.ma/fr/voiture/achat-voiture-occasion/');
    expect(buildMoteurUrl(2)).toBe('https://moteur.ma/fr/voiture/achat-voiture-occasion?page=2');
  });
});
