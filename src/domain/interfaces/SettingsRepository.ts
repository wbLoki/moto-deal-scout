import type { SearchRange } from '../entities/SearchCriteria.js';

/**
 * Persistence boundary for user-adjustable scan settings. Currently just
 * the search range; kept separate from {@link ListingRepository} so the
 * two concerns can evolve (and be stored) independently.
 */
export interface SettingsRepository {
  /** The stored search range, or null if the user has never set one. */
  getSearchRange(): Promise<SearchRange | null>;

  /** Persist the search range (single global value; overwrites any previous). */
  saveSearchRange(range: SearchRange): Promise<void>;
}
