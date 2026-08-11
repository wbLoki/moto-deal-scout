import { describe, expect, it } from 'vitest';
import { ListingScorer } from '../../src/application/services/ListingScorer.js';
import { makeGlobalCriteria, makeListing, makeModelCriteria } from '../fixtures/sampleData.js';

describe('ListingScorer', () => {
  const scorer = new ListingScorer();
  const model = makeModelCriteria();
  const global = makeGlobalCriteria();

  it('scores a listing at/below the fair price minimum with full price points', () => {
    const listing = makeListing({ priceMAD: 60000 });
    const score = scorer.score(listing, model, global);
    expect(score.price).toBe(50);
  });

  it('gives zero price points once the price is far above the fair range', () => {
    const listing = makeListing({ priceMAD: 95000 * 1.5 });
    const score = scorer.score(listing, model, global);
    expect(score.price).toBe(0);
  });

  it('scores an uncalibrated model as average on price, not near-perfect', () => {
    // Without this, the provisional 0–300 000 range makes a cheap listing look
    // like a steal on price alone and fabricates "hot deals" for models the
    // market hasn't told us anything about yet.
    const uncalibrated = makeModelCriteria({ priceRangeMAD: { min: 0, max: 300000 } });
    const score = scorer.score(makeListing({ priceMAD: 60000 }), uncalibrated, global);
    expect(score.price).toBe(25);
    expect(score.reasons.some((r) => r.includes('not calibrated'))).toBe(true);
  });

  it('scores low mileage well and high mileage poorly', () => {
    const lowMileage = scorer.score(makeListing({ mileageKm: 1000 }), model, global);
    const highMileage = scorer.score(makeListing({ mileageKm: 40000 }), model, global);
    expect(lowMileage.mileage).toBeGreaterThan(highMileage.mileage);
    expect(highMileage.mileage).toBe(0);
  });

  it('treats missing mileage as average, not a penalty or bonus', () => {
    const score = scorer.score(makeListing({ mileageKm: undefined }), model, global);
    expect(score.mileage).toBe(Math.round(27 * 0.5));
  });

  it('scores newer years higher than older years', () => {
    const newer = scorer.score(makeListing({ year: 2023 }), model, global);
    const older = scorer.score(makeListing({ year: 2015 }), model, global);
    expect(newer.year).toBeGreaterThan(older.year);
  });

  it('scores preferred cities higher than acceptable-but-not-preferred cities', () => {
    const preferred = scorer.score(makeListing({ city: 'Casablanca' }), model, global);
    const other = scorer.score(makeListing({ city: 'Agadir' }), model, global);
    expect(preferred.city).toBeGreaterThan(other.city);
  });

  it('gives the top preferred city more points than a lower-ranked preferred city', () => {
    const first = scorer.score(makeListing({ city: 'Casablanca' }), model, global);
    const last = scorer.score(makeListing({ city: 'Mohammedia' }), model, global);
    expect(first.city).toBeGreaterThanOrEqual(last.city);
  });

  it('total is the sum of the four components and stays within 0-100', () => {
    const score = scorer.score(makeListing(), model, global);
    expect(score.total).toBe(score.price + score.mileage + score.year + score.city);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('includes human-readable reasons for every factor', () => {
    const score = scorer.score(makeListing(), model, global);
    expect(score.reasons.length).toBeGreaterThanOrEqual(4);
  });
});
