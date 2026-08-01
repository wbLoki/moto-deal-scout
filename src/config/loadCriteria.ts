import { readFile } from 'node:fs/promises';
import type { SearchCriteria } from '../domain/entities/SearchCriteria.js';
import { searchCriteriaSchema } from './criteriaSchema.js';
import { defaultCriteria } from './defaultCriteria.js';

/**
 * Loads search criteria from `CRITERIA_CONFIG_PATH` if set, otherwise
 * falls back to the built-in {@link defaultCriteria}. Either way the
 * result is validated against `searchCriteriaSchema` so a malformed
 * override fails fast with a clear error instead of silently misbehaving.
 */
export async function loadCriteria(overridePath?: string): Promise<SearchCriteria> {
  if (!overridePath) {
    return searchCriteriaSchema.parse(defaultCriteria);
  }

  const raw = await readFile(overridePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  const result = searchCriteriaSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid criteria config at ${overridePath}:\n${details}`);
  }
  return result.data;
}
