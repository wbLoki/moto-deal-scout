import { describe, expect, it } from 'vitest';
import { listingPageButtonSuffix } from '../../src/infrastructure/notifications/listingPagePath.js';

describe('listingPageButtonSuffix', () => {
  it('encodes source and external id for the WhatsApp URL button', () => {
    expect(listingPageButtonSuffix('avito', '123')).toBe('avito/123');
    expect(listingPageButtonSuffix('avito-cars', 'a b')).toBe('avito-cars/a%20b');
  });
});
