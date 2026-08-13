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

const FRENCH_MONTHS: Readonly<Record<string, number>> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};

/**
 * Parses an absolute French date like "13 août 2026".
 * Accents are stripped so mojibake / unaccented months still match.
 */
export function parseFrenchAbsoluteDate(text: string | null | undefined): Date | undefined {
  if (!text) return undefined;
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  const match = /(\d{1,2})\s+([a-z]+)\s+(\d{4})/.exec(normalized);
  if (!match) return undefined;
  const day = Number.parseInt(match[1]!, 10);
  const month = FRENCH_MONTHS[match[2]!];
  const year = Number.parseInt(match[3]!, 10);
  if (month === undefined || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? undefined : date;
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
