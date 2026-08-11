import type { MarketplaceId } from '../../domain/entities/Listing.js';

/** A marketplace listing URL we know how to resolve to source + external id. */
export interface ParsedListingUrl {
  readonly sourceId: MarketplaceId;
  readonly externalId: string;
  readonly url: string;
}

const AVITO_HOST = /(^|\.)avito\.ma$/i;
const AVITO_ID_RE = /_(\d+)\.htm(?:$|\?)/i;

const BIKER_HOST = /(^|\.)biker\.ma$/i;
const BIKER_ID_RE = /\/(?:annonce\/)?detail-moto\/[^/]+\/(\d+)(?:$|\?)/i;

/**
 * If `text` contains an Avito or Biker listing URL, return the first one.
 * Used by the compare paste path so a bare link can be resolved from our DB
 * (we already store price from the daily scan).
 */
export function extractListingUrl(text: string): ParsedListingUrl | undefined {
  const match = /https?:\/\/[^\s<>"']+/gi.exec(text);
  if (!match) return undefined;
  return parseListingUrl(match[0].replace(/[),.;]+$/, ''));
}

/** True when the paste is essentially just a URL (no useful ad body). */
export function isUrlOnlyPaste(text: string): boolean {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return false;
  return extractListingUrl(trimmed) !== undefined;
}

/** Pure parse of a single Avito/Biker listing URL. */
export function parseListingUrl(raw: string): ParsedListingUrl | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return undefined;
  }

  if (AVITO_HOST.test(parsed.hostname)) {
    const id = AVITO_ID_RE.exec(parsed.pathname)?.[1];
    if (!id) return undefined;
    return { sourceId: 'avito', externalId: id, url: parsed.toString() };
  }

  if (BIKER_HOST.test(parsed.hostname)) {
    const id = BIKER_ID_RE.exec(parsed.pathname)?.[1];
    if (!id) return undefined;
    return { sourceId: 'biker', externalId: id, url: parsed.toString() };
  }

  return undefined;
}
