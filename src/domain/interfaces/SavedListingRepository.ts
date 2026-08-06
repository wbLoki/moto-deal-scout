import type { ScoredListing } from '../entities/ScoredListing.js';

/** Persistence for the listings a user has bookmarked ("saved"). */
export interface SavedListingRepository {
  add(userId: string, sourceId: string, externalId: string): Promise<void>;
  remove(userId: string, sourceId: string, externalId: string): Promise<void>;
  /** Keys ("sourceId:externalId") the user has saved, for marking cards. */
  listSavedKeys(userId: string): Promise<string[]>;
  /** The user's saved listings as full scored deals, most recently saved first. */
  listSavedDeals(userId: string): Promise<ScoredListing[]>;
}
