import { describe, expect, it } from 'vitest';
import type { AiExtractor, ExtractArgs } from '../../src/infrastructure/ai/AnthropicClient.js';
import {
  estimateAndEvaluate,
  estimateFairRange,
} from '../../src/application/services/aiPriceEstimator.js';
import { parseListing } from '../../src/application/services/aiListingParser.js';
import { reviewRange } from '../../src/application/services/aiPriceReviewer.js';
import { makeGlobalCriteria, makeModelCriteria } from '../fixtures/sampleData.js';

/** Returns canned data, validated through each feature's own zod schema — no network. */
function fakeAi(canned: unknown): AiExtractor {
  return {
    extract: <T>(args: ExtractArgs<T>): Promise<T> => Promise.resolve(args.schema.parse(canned)),
  };
}

describe('aiPriceEstimator', () => {
  const canned = {
    fairMinMAD: 50000,
    fairMaxMAD: 70000,
    typicalMaxMileageKm: 40000,
    typicalMinYear: 2015,
    confidence: 'medium',
    rationale: 'Typical Moroccan resale for this model.',
  };

  it('normalizes the range (orders min ≤ max, rounds to ints)', async () => {
    const swapped = { ...canned, fairMinMAD: 70000.4, fairMaxMAD: 50000.6 };
    const est = await estimateFairRange(fakeAi(swapped), { brand: 'X', model: 'Y' });
    expect(est.fairMinMAD).toBe(50001);
    expect(est.fairMaxMAD).toBe(70000);
  });

  it('scores against the AI range and flags the result ai-estimated', async () => {
    const res = await estimateAndEvaluate(
      fakeAi(canned),
      { brand: 'Zonkler', model: 'Z1', priceMAD: 45000, mileageKm: 10000, year: 2020, city: 'Casablanca' },
      makeGlobalCriteria(),
    );
    expect(res.status).toBe('ai-estimated');
    expect(res.ai?.confidence).toBe('medium');
    expect(res.suggestion?.fairMin).toBe(50000);
    // 45 000 is below the AI fair min (50 000).
    expect(res.rating?.pricePosition).toBe('below');
  });
});

describe('aiListingParser', () => {
  it('maps extracted fields, omitting nulls', async () => {
    const input = await parseListing(
      fakeAi({
        brand: ' Yamaha ',
        model: ' MT-07 ',
        year: 2019,
        mileageKm: 15000,
        priceMAD: 60000,
        city: 'Casablanca',
      }),
      'Yamaha MT-07 2019, 15000 km, 60000 dh, Casablanca',
    );
    expect(input).toEqual({
      brand: 'Yamaha',
      model: 'MT-07',
      year: 2019,
      mileageKm: 15000,
      priceMAD: 60000,
      city: 'Casablanca',
    });
  });

  it('omits fields the ad did not state (nulls become undefined)', async () => {
    const input = await parseListing(
      fakeAi({ brand: 'Honda', model: 'CB500F', year: null, mileageKm: null, priceMAD: null, city: null }),
      'CB500F à vendre',
    );
    expect(input).toEqual({ brand: 'Honda', model: 'CB500F' });
    expect('priceMAD' in input).toBe(false);
  });
});

describe('aiPriceReviewer', () => {
  const model = makeModelCriteria({ priceRangeMAD: { min: 65000, max: 95000 } });

  it('passes through a flagged verdict with a rounded suggestion', async () => {
    const review = await reviewRange(
      fakeAi({ verdict: 'too-high', suggestedMinMAD: 40000.7, suggestedMaxMAD: 60000.2, note: 'High for MA.' }),
      model,
    );
    expect(review.verdict).toBe('too-high');
    expect(review.suggestedMinMAD).toBe(40001);
    expect(review.suggestedMaxMAD).toBe(60000);
  });

  it('omits suggestions when the range is plausible', async () => {
    const review = await reviewRange(
      fakeAi({ verdict: 'plausible', suggestedMinMAD: null, suggestedMaxMAD: null, note: 'Looks right.' }),
      model,
    );
    expect(review.verdict).toBe('plausible');
    expect('suggestedMinMAD' in review).toBe(false);
  });
});
