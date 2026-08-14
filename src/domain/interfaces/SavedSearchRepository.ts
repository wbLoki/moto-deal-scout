import type { SavedSearch } from '../entities/SavedSearch.js';
import type { VehicleType } from '../entities/VehicleType.js';

export interface SavedSearchRepository {
  listForUser(userId: string, vehicleType?: VehicleType): Promise<SavedSearch[]>;
  get(id: string, userId: string): Promise<SavedSearch | undefined>;
  insert(search: SavedSearch): Promise<void>;
  update(search: SavedSearch): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  /** Every search in the database, for alert fan-out. */
  listAll(): Promise<SavedSearch[]>;
}
