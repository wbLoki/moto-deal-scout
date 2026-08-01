import type { SearchRange } from '../entities/SearchCriteria.js';

/** Per-user budget/year window used to filter that user's dashboard feed. */
export interface UserSearchRangeRepository {
  get(userId: string): Promise<SearchRange | null>;
  save(userId: string, range: SearchRange): Promise<void>;
}
