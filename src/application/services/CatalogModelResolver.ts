import type { CatalogBrand } from '../../catalog/motorcycleCatalog.js';
import { MOTORCYCLE_CATALOG, suggestAliases } from '../../catalog/motorcycleCatalog.js';
import { modelId } from '../../domain/services/provisionalModel.js';

/**
 * Minimum confidence before discovery will create a model row. Deliberately
 * stricter than the scan's `minModelMatchConfidence` (0.55): a false positive
 * there mis-scores one listing, whereas a false positive here creates a
 * permanent model that users can follow.
 */
export const MIN_DISCOVERY_CONFIDENCE = 0.8;

/**
 * The three models seeded by `defaultCriteria` predate this resolver and use
 * ids that don't match what `slugify` produces today (`yamaha-mt07` vs
 * `yamaha-mt-07`). Map the derived id back onto the seeded one so discovery
 * updates the existing row instead of creating a near-duplicate.
 */
const LEGACY_ID_ALIASES: ReadonlyMap<string, string> = new Map([
  ['yamaha-mt-07', 'yamaha-mt07'],
  ['honda-cb-500f', 'honda-cb500f'],
  ['kawasaki-z-650', 'kawasaki-z650'],
]);

export interface CatalogMatch {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly aliases: readonly string[];
  /** 1.0 when the brand was named too, 0.85 when only the model was found. */
  readonly confidence: number;
}

interface CatalogEntry {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly aliases: readonly string[];
  /** Brand name as tokens, e.g. ["moto", "guzzi"]. */
  readonly brandTokens: readonly string[];
  /** Tokenized model spellings, longest first. */
  readonly needles: readonly string[][];
}

/**
 * Splits text into comparable tokens: accents stripped, lowercased, and cut
 * at every non-alphanumeric run *and* at each letter/digit boundary.
 *
 * That last part is what makes separators stop mattering: "Z900", "Z 900" and
 * "z-900" all tokenize to ["z", "900"], so a seller's spacing can't hide a
 * model from us. Comparing token runs rather than raw substrings also means a
 * needle can never match across a word boundary the way a naive
 * `includes("z900")` would inside "kawasakiz900".
 */
function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** True when `needle`'s tokens appear as a contiguous run inside `haystack`. */
function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * One token run per distinct spelling of the model, longest first so that
 * "YZF-R125" wins over "YZF-R1" on a title containing the former.
 */
function needlesFor(model: string, aliases: readonly string[]): string[][] {
  const byKey = new Map<string, string[]>();
  for (const name of [model, ...aliases]) {
    const tokens = tokenize(name);
    if (tokens.length === 0) continue;
    byKey.set(tokens.join(' '), tokens);
  }
  return [...byKey.values()].sort((a, b) => b.join('').length - a.join('').length);
}

function buildEntries(catalog: readonly CatalogBrand[]): readonly CatalogEntry[] {
  return catalog.flatMap((brand) =>
    brand.models.map((model): CatalogEntry => {
      const aliases = suggestAliases(model);
      const derivedId = modelId(brand.brand, model);
      return {
        id: LEGACY_ID_ALIASES.get(derivedId) ?? derivedId,
        brand: brand.brand,
        model,
        aliases,
        brandTokens: tokenize(brand.brand),
        needles: needlesFor(model, aliases),
      };
    }),
  );
}

function indexByBrand(entries: readonly CatalogEntry[]): ReadonlyMap<string, readonly CatalogEntry[]> {
  const map = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const key = entry.brandTokens.join(' ');
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  return map;
}

/**
 * A needle is safe to match without its brand only if it's distinctive enough
 * to not be ordinary prose. The catalog genuinely contains bare words like
 * "Like", "People", "Django" and "Agility" (Kymco/Peugeot scooters), so
 * without this guard a title such as "scooter comme neuf, je like" would
 * create a Kymco Like. Requiring a digit keeps the model names that carry a
 * displacement or series number — which is nearly all of them.
 */
function isDistinctiveEnough(needle: readonly string[]): boolean {
  const joined = needle.join('');
  return joined.length >= 4 && /\d/.test(joined);
}

function toMatch(entry: CatalogEntry, confidence: number): CatalogMatch {
  return {
    id: entry.id,
    brand: entry.brand,
    model: entry.model,
    aliases: entry.aliases,
    confidence,
  };
}

/** Length used to rank competing matches — longer model name wins. */
function weight(needle: readonly string[]): number {
  return needle.join('').length;
}

/**
 * True when the title leads with a word that is neither part of the matched
 * model name nor any brand we know — i.e. it almost certainly names a maker
 * missing from our catalog.
 *
 * Both marketplaces put the brand first, so "YAMAX Yamax z400" is a Yamax,
 * not the Kawasaki Z400 that "z400" alone would suggest. Titles that legitimately
 * omit the brand ("xmax 300 premier", "MT-07 2020") lead with the model itself,
 * so they're unaffected.
 */
function namesAnotherMaker(
  tokens: readonly string[],
  needle: readonly string[],
  knownBrandTokens: ReadonlySet<string>,
): boolean {
  const first = tokens[0];
  if (first === undefined) return false;
  if (needle.includes(first)) return false;
  if (!/^[a-z]{3,}$/.test(first)) return false;
  return !knownBrandTokens.has(first);
}

/**
 * Resolves a free-text listing title to a known catalog model.
 *
 * Deliberately token-matched rather than fuzzy: the index is built once at
 * module load and each title costs a few array walks. The alternative —
 * reusing {@link FuzzyModelMatcher} — constructs a Fuse instance per
 * (title × model) pair, which is ~400 per listing and millions across a full
 * discovery crawl.
 *
 * Returns undefined when nothing matches confidently, which means the listing
 * is simply skipped: discovery is restricted to the catalog on purpose, so
 * the long tail never auto-creates messy near-duplicate models.
 */
export class CatalogModelResolver {
  private readonly entries: readonly CatalogEntry[];
  private readonly byBrand: ReadonlyMap<string, readonly CatalogEntry[]>;
  private readonly knownBrandTokens: ReadonlySet<string>;

  constructor(catalog: readonly CatalogBrand[] = MOTORCYCLE_CATALOG) {
    this.entries = buildEntries(catalog);
    this.byBrand = indexByBrand(this.entries);
    this.knownBrandTokens = new Set(this.entries.flatMap((entry) => entry.brandTokens));
  }

  /**
   * The catalog brand named in a title, or undefined if none is. Used to sort
   * dropped listings into the admin review queue: a title that names a maker we
   * know (Yamaha, Honda, KTM…) but resolves to no model is very likely a real
   * bike whose model is simply missing from the catalog — worth a human look —
   * whereas one naming no known brand is almost always a scooter/rental/part.
   */
  knownBrandIn(title: string): string | undefined {
    const tokens = tokenize(title);
    for (const [, candidates] of this.byBrand) {
      const brandTokens = candidates[0]?.brandTokens;
      if (brandTokens && containsRun(tokens, brandTokens)) return candidates[0]?.brand;
    }
    return undefined;
  }

  resolve(title: string): CatalogMatch | undefined {
    const tokens = tokenize(title);

    // Naming the brand is strong evidence, and narrows ~400 entries to ~15.
    // Longest matching model name wins so "YZF-R125" beats "YZF-R1" on a
    // title containing the former, whatever order the catalog lists them in.
    let branded: CatalogMatch | undefined;
    let brandedWeight = 0;
    for (const [, candidates] of this.byBrand) {
      const brandTokens = candidates[0]?.brandTokens;
      if (!brandTokens || !containsRun(tokens, brandTokens)) continue;
      for (const entry of candidates) {
        for (const needle of entry.needles) {
          if (!containsRun(tokens, needle)) continue;
          if (weight(needle) > brandedWeight) {
            branded = toMatch(entry, 1);
            brandedWeight = weight(needle);
          }
          break;
        }
      }
    }
    if (branded) return branded;

    // No catalog brand named — accept only unambiguous model names, and only
    // when nothing in the title claims a *different* maker (see below).
    let best: CatalogMatch | undefined;
    let bestWeight = 0;
    for (const entry of this.entries) {
      for (const needle of entry.needles) {
        if (!isDistinctiveEnough(needle) || !containsRun(tokens, needle)) continue;
        if (namesAnotherMaker(tokens, needle, this.knownBrandTokens)) continue;
        if (weight(needle) > bestWeight) {
          best = toMatch(entry, 0.85);
          bestWeight = weight(needle);
        }
        break;
      }
    }
    return best;
  }
}
