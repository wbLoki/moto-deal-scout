/**
 * Text-parsing helpers shared by every scraper. Marketplace markup is
 * unstyled/obfuscated CSS-in-JS in places (Avito) so these lean on stable
 * signals — literal units ("DH", "km"), `title` attributes, or relative
 * date phrasing — rather than hashed class names wherever possible.
 */

/** "25 000", "25,000", "25.000 DH" → 25000. Returns undefined if no digits found. */
export function parseNumber(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const digitsOnly = text.replace(/[^\d]/g, '');
  if (digitsOnly.length === 0) return undefined;
  return Number.parseInt(digitsOnly, 10);
}

/** First 4-digit year (1980-2100ish) found in the text. */
export function parseYear(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const match = /\b(19[89]\d|20\d{2})\b/.exec(text);
  return match ? Number.parseInt(match[0], 10) : undefined;
}

const FRENCH_RELATIVE_UNITS: ReadonlyArray<{ pattern: RegExp; toMs: (n: number) => number }> = [
  { pattern: /minute/, toMs: (n) => n * 60_000 },
  { pattern: /heure/, toMs: (n) => n * 60 * 60_000 },
  { pattern: /jour/, toMs: (n) => n * 24 * 60 * 60_000 },
  { pattern: /semaine/, toMs: (n) => n * 7 * 24 * 60 * 60_000 },
  { pattern: /mois/, toMs: (n) => n * 30 * 24 * 60 * 60_000 },
  { pattern: /\ban\b|année/, toMs: (n) => n * 365 * 24 * 60 * 60_000 },
];

/**
 * Parses Avito/Biker-style French relative timestamps
 * ("il y a 3 heures", "il y a 2 jours", "aujourd'hui", "hier") into a
 * Date. Returns undefined for unrecognized formats rather than guessing.
 */
export function parseRelativeFrenchDate(
  text: string | null | undefined,
  now: Date = new Date(),
): Date | undefined {
  if (!text) return undefined;
  const normalized = text.trim().toLowerCase();

  if (normalized.includes("aujourd'hui")) return now;
  if (normalized.includes('hier')) return new Date(now.getTime() - 24 * 60 * 60_000);

  const countMatch = /(\d+)/.exec(normalized);
  const count = countMatch?.[1] ? Number.parseInt(countMatch[1], 10) : 1;

  for (const unit of FRENCH_RELATIVE_UNITS) {
    if (unit.pattern.test(normalized)) {
      return new Date(now.getTime() - unit.toMs(count));
    }
  }
  return undefined;
}

/** "MT-07" -> "mt_07", used to build Avito's slug-based search URLs. */
export function slugifyForAvito(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** "YAMAHA MT-07" -> "yamaha-mt-07", used to build human-readable detail URLs. */
export function slugifyWithHyphens(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
