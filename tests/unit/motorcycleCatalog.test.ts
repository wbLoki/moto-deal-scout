import { describe, expect, it } from 'vitest';
import {
  CATALOG_BRANDS,
  MOTORCYCLE_CATALOG,
  modelsForBrand,
  suggestAliases,
} from '../../src/catalog/motorcycleCatalog.js';
import { fallbackDisplacementCc } from '../../src/catalog/modelDisplacement.js';

describe('motorcycle catalog', () => {
  it('has unique brand names and non-empty model lists', () => {
    const brands = MOTORCYCLE_CATALOG.map((b) => b.brand);
    expect(new Set(brands).size).toBe(brands.length);
    for (const b of MOTORCYCLE_CATALOG) {
      expect(b.models.length).toBeGreaterThan(0);
      expect(new Set(b.models).size).toBe(b.models.length); // no dup models within a brand
    }
  });

  it('exposes brands sorted alphabetically', () => {
    expect(CATALOG_BRANDS).toEqual([...CATALOG_BRANDS].sort((a, b) => a.localeCompare(b)));
  });

  it('looks up models for a brand case-insensitively', () => {
    expect(modelsForBrand('yamaha')).toContain('MT-07');
    expect(modelsForBrand('YAMAHA')).toContain('MT-09');
    expect(modelsForBrand('Nonexistent')).toEqual([]);
  });
});

describe('fallbackDisplacementCc', () => {
  it('uses typical cc for series names that are not the engine size', () => {
    expect(fallbackDisplacementCc('MT-07')).toBe(689);
    expect(fallbackDisplacementCc('YZF-R1')).toBe(998);
    expect(fallbackDisplacementCc('CB500F')).toBe(500);
    expect(fallbackDisplacementCc('NMAX 155')).toBe(155);
    expect(fallbackDisplacementCc('NMAX')).toBe(0);
  });
});

describe('suggestAliases', () => {
  it('generates dash/space variants and drops the original', () => {
    const aliases = suggestAliases('MT-07');
    expect(aliases).toContain('MT07');
    expect(aliases).toContain('MT 07');
    expect(aliases).not.toContain('MT-07');
  });

  it('returns nothing for a single plain token', () => {
    expect(suggestAliases('Monster')).toEqual([]);
  });

  it('handles empty input', () => {
    expect(suggestAliases('  ')).toEqual([]);
  });
});
