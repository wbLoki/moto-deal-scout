import { uniqueListingImages } from '../../../domain/listingImages.js';

export const BIKER_PHOTO_BASE = 'https://www.biker.ma/uploads/';
const PHOTO_KEYS = ['photo1', 'photo2', 'photo3', 'photo4', 'photo5', 'photo6', 'photo7', 'photo8'] as const;

/** Absolute gallery URLs from a Biker list or detail JSON row. */
export function bikerPhotoUrls(row: object): string[] {
  const rec = row as Record<string, unknown>;
  const urls: string[] = [];
  for (const key of PHOTO_KEYS) {
    const v = rec[key];
    if (typeof v !== 'string') continue;
    const path = v.trim();
    if (!path) continue;
    urls.push(/^https?:\/\//i.test(path) ? path : `${BIKER_PHOTO_BASE}${path}`);
  }
  return uniqueListingImages(urls);
}
