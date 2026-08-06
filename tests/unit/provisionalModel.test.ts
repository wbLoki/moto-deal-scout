import { describe, expect, it } from 'vitest';
import { modelId } from '../../src/domain/services/provisionalModel.js';

describe('modelId', () => {
  it('strips accents instead of treating them as separators', () => {
    expect(modelId('Yamaha', 'Ténéré 700')).toBe('yamaha-tenere-700');
    expect(modelId('Yamaha', 'Super Ténéré 1200')).toBe('yamaha-super-tenere-1200');
  });

  it('collapses punctuation and case', () => {
    expect(modelId('Harley-Davidson', 'Forty Eight')).toBe('harley-davidson-forty-eight');
    expect(modelId('Kawasaki', 'Z900')).toBe('kawasaki-z900');
    expect(modelId('BMW', 'F 850 GS')).toBe('bmw-f-850-gs');
  });

  it('is stable across the paths that can create a model', () => {
    // Discovery, an approved request and an admin edit all derive ids from
    // this one function; if they diverged the same bike would be stored twice.
    expect(modelId(' yamaha ', ' MT-07 ')).toBe(modelId('Yamaha', 'MT-07'));
  });
});
