import { describe, expect, it } from 'vitest';
import { parseListingCondition } from '../../src/domain/entities/ListingCondition.js';

describe('parseListingCondition', () => {
  it('detects première main, WW, dédouanée and jamais accidentée', () => {
    expect(
      parseListingCondition(
        'Dacia Duster première main WW dédouanée 2021',
        'jamais accidentée carnet d’entretien',
      ),
    ).toEqual({
      firstOwner: true,
      ww: true,
      accidented: false,
      customsCleared: true,
    });
  });

  it('flags accidentée when not negated', () => {
    expect(parseListingCondition('Golf accidentée à vendre', undefined).accidented).toBe(true);
  });

  it('returns undefined flags when the text is silent', () => {
    expect(parseListingCondition('Renault Clio 2017 Diesel', undefined)).toEqual({
      firstOwner: undefined,
      ww: undefined,
      accidented: undefined,
      customsCleared: undefined,
    });
  });
});
