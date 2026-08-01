import type { ModelCriteria } from './SearchCriteria.js';

/** A tracked model as stored/managed by the admin: scan criteria plus an on/off switch. */
export interface StoredModel extends ModelCriteria {
  readonly enabled: boolean;
}
