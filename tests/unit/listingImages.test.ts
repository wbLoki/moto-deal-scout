import { describe, expect, it } from 'vitest';
import { uniqueListingImages } from '../../src/domain/listingImages.js';

describe('uniqueListingImages', () => {
  it('drops duplicate paths that only differ by query string', () => {
    expect(
      uniqueListingImages([
        'https://content.avito.ma/classifieds/images/101?t=images',
        'https://content.avito.ma/classifieds/images/101?t=thumb',
        'https://content.avito.ma/classifieds/images/102?t=images',
      ]),
    ).toEqual([
      'https://content.avito.ma/classifieds/images/101?t=images',
      'https://content.avito.ma/classifieds/images/102?t=images',
    ]);
  });
});
