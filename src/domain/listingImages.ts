/**
 * Dedupe listing photos by path. Query params (`?t=images` vs `?t=thumb`)
 * are the same file on Avito's CDN, so they must not become two slides.
 */
export function uniqueListingImages(
  ...groups: Array<readonly (string | undefined | null)[] | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const raw of group ?? []) {
      const url = raw?.trim();
      if (!url) continue;
      const key = url.split('?')[0]!.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
  }
  return out;
}
