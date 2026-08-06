import { describe, expect, it } from 'vitest';
import {
  CatalogModelResolver,
  MIN_DISCOVERY_CONFIDENCE,
} from '../../src/application/services/CatalogModelResolver.js';

describe('CatalogModelResolver', () => {
  const resolver = new CatalogModelResolver();

  it('resolves a brand + model title to the catalog model', () => {
    const match = resolver.resolve('Yamaha MT-07 2019 excellent état');
    expect(match?.id).toBe('yamaha-mt07');
    expect(match?.brand).toBe('Yamaha');
    expect(match?.confidence).toBe(1);
  });

  it('matches spelling variants the seller used', () => {
    expect(resolver.resolve('Moto Yamaha MT07 phase 2')?.id).toBe('yamaha-mt07');
    expect(resolver.resolve('yamaha mt 07 full options')?.id).toBe('yamaha-mt07');
  });

  it('reuses the legacy seeded ids instead of creating near-duplicates', () => {
    expect(resolver.resolve('Yamaha MT-07')?.id).toBe('yamaha-mt07');
    expect(resolver.resolve('Honda CB500F 2018')?.id).toBe('honda-cb500f');
    expect(resolver.resolve('Kawasaki Z650 bon état')?.id).toBe('kawasaki-z650');
  });

  it('ignores how the seller spaced the model name', () => {
    // Real Biker.ma titles include both spellings; they must collapse to one
    // model rather than creating "Z 900" and "Z900" as separate rows.
    const spaced = resolver.resolve('KAWASAKI Z 900');
    const tight = resolver.resolve('KAWASAKI z900');
    expect(spaced?.id).toBe('kawasaki-z900');
    expect(tight?.id).toBe(spaced?.id);
  });

  it('does not match a model name across a word boundary', () => {
    // Guards the tokenizer: a naive squashed-string match would find "z900"
    // inside "kawasakiz900" and match things that were never written.
    expect(resolver.resolve('kawasakiz900 replique')).toBeUndefined();
  });

  it('prefers the longest model name so YZF-R125 beats YZF-R1', () => {
    const match = resolver.resolve('Yamaha YZF-R125 2021');
    expect(match?.model).toBe('YZF-R125');
  });

  it('matches an accented catalog name from an unaccented title', () => {
    const match = resolver.resolve('yamaha tenere 700 rally edition');
    expect(match?.model).toBe('Ténéré 700');
  });

  it('builds a readable id from an accented model name', () => {
    // Regression: collapsing punctuation before stripping accents treated
    // each accented letter as a separator and produced "yamaha-t-n-r-700".
    expect(resolver.resolve('Yamaha Ténéré 700')?.id).toBe('yamaha-tenere-700');
    expect(resolver.resolve('Yamaha Super Ténéré 1200')?.id).toBe('yamaha-super-tenere-1200');
  });

  it('resolves a model named without its brand, at lower confidence', () => {
    const match = resolver.resolve('MT-07 2020 première main');
    expect(match?.id).toBe('yamaha-mt07');
    expect(match?.confidence).toBe(0.85);
    expect(match?.confidence).toBeGreaterThanOrEqual(MIN_DISCOVERY_CONFIDENCE);
  });

  it('does not let an ordinary word create a model', () => {
    // The catalog really does contain Kymco "Like", "People" and "Agility"
    // and Peugeot "Django" — bare words that appear in normal French prose.
    expect(resolver.resolve('Vélo pliable, comme neuf, je like')).toBeUndefined();
    expect(resolver.resolve('Vends moto, beaucoup de people intéressés')).toBeUndefined();
    expect(resolver.resolve('Agility et confort au rendez-vous')).toBeUndefined();
  });

  it('still resolves those models when the brand is named', () => {
    expect(resolver.resolve('Kymco Agility 50 très bon état')?.brand).toBe('Kymco');
  });

  it('does not attribute a bike to us when the title names an unknown maker', () => {
    // Real Biker.ma listing. "Yamax" is a local brand absent from the
    // catalog; matching on "z400" alone would file it as a Kawasaki Z400.
    expect(resolver.resolve('YAMAX Yamax z400')).toBeUndefined();
  });

  it('still resolves a brandless title that leads with the model', () => {
    // The unknown-maker check must not break the case it sits next to:
    // these lead with the model itself, not with someone else's brand.
    expect(resolver.resolve('xmax 300 premier main 8000km')?.id).toBe('yamaha-xmax-300');
    expect(resolver.resolve('MT-07 2020 première main')?.id).toBe('yamaha-mt07');
  });

  it('matches a bare NMAX but still prefers a displacement variant when present', () => {
    // Most Moroccan NMAX ads omit the displacement ("YAMAHA NMAX"). Without a
    // generic entry those match nothing and get dropped from the feed; with it
    // they resolve to yamaha-nmax, while "NMAX 155" still wins on longer match.
    expect(resolver.resolve('YAMAHA NMAX')?.id).toBe('yamaha-nmax');
    expect(resolver.resolve('Yamaha NMAX 155 2022')?.id).toBe('yamaha-nmax-155');
  });

  it('returns undefined for a title unrelated to any catalog model', () => {
    expect(resolver.resolve('Vélo électrique pliable neuf')).toBeUndefined();
  });

  it('is deterministic across repeated calls', () => {
    const title = 'Yamaha MT-09 SP 2022';
    expect(resolver.resolve(title)?.id).toBe(resolver.resolve(title)?.id);
  });
});
