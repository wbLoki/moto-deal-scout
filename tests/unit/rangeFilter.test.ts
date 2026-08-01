import { describe, expect, it } from 'vitest';
import type { SearchRange } from '../../src/domain/entities/SearchCriteria.js';
import { listingWithinRange } from '../../src/domain/services/rangeFilter.js';

const range: SearchRange = { budgetMin: 50000, budgetMax: 90000, yearMin: 2018, yearMax: 2024 };

describe('listingWithinRange', () => {
  it('accepts a listing inside both bounds', () => {
    expect(listingWithinRange({ priceMAD: 70000, year: 2020 }, range)).toBe(true);
  });

  it('rejects a listing priced above the budget', () => {
    expect(listingWithinRange({ priceMAD: 95000, year: 2020 }, range)).toBe(false);
  });

  it('rejects a listing priced below the budget', () => {
    expect(listingWithinRange({ priceMAD: 40000, year: 2020 }, range)).toBe(false);
  });

  it('rejects a listing with a year outside the window', () => {
    expect(listingWithinRange({ priceMAD: 70000, year: 2016 }, range)).toBe(false);
  });

  it('accepts a listing with unknown year (cannot be judged) if price is in range', () => {
    expect(listingWithinRange({ priceMAD: 70000, year: undefined }, range)).toBe(true);
  });

  it('accepts on the exact bounds', () => {
    expect(listingWithinRange({ priceMAD: 50000, year: 2018 }, range)).toBe(true);
    expect(listingWithinRange({ priceMAD: 90000, year: 2024 }, range)).toBe(true);
  });
});
