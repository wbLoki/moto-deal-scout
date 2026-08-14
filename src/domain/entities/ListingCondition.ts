/**
 * Flags inferred from listing title/description. Undefined means the ad
 * didn't mention it — not "false".
 */
export interface ListingCondition {
  readonly firstOwner: boolean | undefined;
  readonly ww: boolean | undefined;
  readonly accidented: boolean | undefined;
  readonly customsCleared: boolean | undefined;
}

export const EMPTY_CONDITION: ListingCondition = {
  firstOwner: undefined,
  ww: undefined,
  accidented: undefined,
  customsCleared: undefined,
};

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Heuristic parse of Moroccan classifieds copy (FR + common AR). Titles carry
 * most of the signal on Avito search cards, which don't include a description.
 */
export function parseListingCondition(
  title: string | undefined,
  description: string | undefined,
): ListingCondition {
  const t = fold(`${title ?? ''} ${description ?? ''}`);
  if (!t.trim()) return EMPTY_CONDITION;

  let firstOwner: boolean | undefined;
  if (
    /premiere?\s*main|1[eè]re?\s*main|premier\s+proprietaire|first\s+owner|يد\s*اول|يدا\s*اول/.test(
      t,
    )
  ) {
    firstOwner = true;
  }

  let ww: boolean | undefined;
  if (/\bww\b|origine\s+ww/.test(t)) ww = true;

  let accidented: boolean | undefined;
  if (/jamais\s+accident|non\s+accident|pas\s+d['’]?\s*accident|بدون\s*حادث/.test(t)) {
    accidented = false;
  } else if (/\baccident/.test(t) || /محطمة|حادث/.test(t)) {
    accidented = true;
  }

  let customsCleared: boolean | undefined;
  if (/dedouan|dédouan|dedouanee|ديوانة|مدونة/.test(t)) customsCleared = true;

  return { firstOwner, ww, accidented, customsCleared };
}
