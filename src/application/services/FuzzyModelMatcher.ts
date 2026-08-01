import Fuse from 'fuse.js';
import type { ModelCriteria } from '../../domain/entities/SearchCriteria.js';
import type { ModelMatch } from '../../domain/entities/ScoredListing.js';

/** Fuse.js threshold: 0 requires an exact match, 1 matches almost anything. */
const FUSE_THRESHOLD = 0.35;

function aliasesFor(criteria: ModelCriteria): string[] {
  const base = [criteria.model, `${criteria.brand} ${criteria.model}`];
  const withAliases = criteria.aliases.flatMap((alias) => [alias, `${criteria.brand} ${alias}`]);
  return [...new Set([...base, ...withAliases])];
}

function toConfidence(fuseScore: number): number {
  return Math.max(0, Math.min(1, 1 - fuseScore));
}

/**
 * Confirms whether a listing's free-text title actually refers to a model
 * we're hunting for. Marketplace search boxes are unreliable (and Biker.ma
 * / Moteur.ma may not support model-level search at all), so every listing
 * we keep gets its title checked here before it's scored.
 *
 * Fuse.js is built for "search a list of short items with a query", and
 * its underlying bitap algorithm only handles query patterns up to ~32
 * characters. Listing titles are free text and routinely longer than
 * that, so each check indexes the *title* as the searchable text and
 * searches it with each short alias as the query — not the other way
 * around, which would silently fail to match on longer titles.
 */
export class FuzzyModelMatcher {
  constructor(private readonly models: readonly ModelCriteria[]) {}

  /** Best match across every wanted model, or undefined if nothing matches at all. */
  matchBest(title: string): ModelMatch | undefined {
    let best: ModelMatch | undefined;
    for (const criteria of this.models) {
      const confidence = this.matchAgainst(title, criteria);
      if (confidence > 0 && (!best || confidence > best.confidence)) {
        best = { criteria, confidence };
      }
    }
    return best;
  }

  /** Confidence (0-1) that `title` refers to this specific model. 0 if there's no match. */
  matchAgainst(title: string, criteria: ModelCriteria): number {
    const fuse = new Fuse([{ text: title }], {
      keys: ['text'],
      includeScore: true,
      threshold: FUSE_THRESHOLD,
      ignoreLocation: true,
      isCaseSensitive: false,
    });

    let bestConfidence = 0;
    for (const alias of aliasesFor(criteria)) {
      const hit = fuse.search(alias)[0];
      if (hit?.score !== undefined) {
        bestConfidence = Math.max(bestConfidence, toConfidence(hit.score));
      }
    }
    return bestConfidence;
  }
}
