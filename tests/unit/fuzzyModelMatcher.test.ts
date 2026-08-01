import { describe, expect, it } from 'vitest';
import { FuzzyModelMatcher } from '../../src/application/services/FuzzyModelMatcher.js';
import { makeModelCriteria } from '../fixtures/sampleData.js';

describe('FuzzyModelMatcher', () => {
  const mt07 = makeModelCriteria({ id: 'yamaha-mt07', brand: 'Yamaha', model: 'MT-07' });
  const cb500f = makeModelCriteria({
    id: 'honda-cb500f',
    brand: 'Honda',
    model: 'CB500F',
    aliases: ['CB 500F', 'CB500'],
  });

  it('matches an exact title with high confidence', () => {
    const matcher = new FuzzyModelMatcher([mt07, cb500f]);
    const result = matcher.matchBest('Yamaha MT-07 2019 excellent état');
    expect(result?.criteria.id).toBe('yamaha-mt07');
    expect(result?.confidence).toBeGreaterThan(0.5);
  });

  it('matches common spelling variants via aliases', () => {
    const matcher = new FuzzyModelMatcher([mt07, cb500f]);
    const result = matcher.matchBest('Moto Yamaha MT07 phase 2');
    expect(result?.criteria.id).toBe('yamaha-mt07');
  });

  it('does not confuse two different wanted models', () => {
    const matcher = new FuzzyModelMatcher([mt07, cb500f]);
    const result = matcher.matchBest('Honda CB500F 2018 très bon état');
    expect(result?.criteria.id).toBe('honda-cb500f');
  });

  it('returns undefined for a title with no relation to any wanted model', () => {
    const matcher = new FuzzyModelMatcher([mt07, cb500f]);
    const result = matcher.matchBest('Vélo électrique pliable neuf');
    expect(result).toBeUndefined();
  });

  it('matchAgainst returns 0 confidence for an unrelated title', () => {
    const matcher = new FuzzyModelMatcher([mt07, cb500f]);
    expect(matcher.matchAgainst('Scooter Chinois 50cc', mt07)).toBe(0);
  });

  it('matchAgainst returns high confidence for a matching title', () => {
    const matcher = new FuzzyModelMatcher([mt07, cb500f]);
    expect(matcher.matchAgainst('Yamaha MT-07 2020', mt07)).toBeGreaterThan(0.5);
  });
});
