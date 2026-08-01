import type { StoredModel } from '../entities/Model.js';
import type { ModelCriteria } from '../entities/SearchCriteria.js';

/**
 * Admin-managed set of tracked models. The scanner reads only the enabled
 * ones; the admin UI sees all of them.
 */
export interface ModelRepository {
  /** Enabled models as scan criteria (the list the scanner iterates). */
  listEnabledCriteria(): Promise<ModelCriteria[]>;
  /** Every model, enabled or not, for admin management. */
  listAll(): Promise<StoredModel[]>;
  /** Insert or update a model by id. */
  upsert(model: StoredModel): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  delete(id: string): Promise<void>;
  /** Populates the table from the given models only if it's currently empty. */
  seedIfEmpty(models: readonly ModelCriteria[]): Promise<void>;
}
