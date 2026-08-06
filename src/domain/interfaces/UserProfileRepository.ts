/**
 * Per-user profile state that isn't authentication: which models they
 * follow, and whether they've been through onboarding.
 */
export interface UserProfileRepository {
  /** Model ids the user follows. */
  getWatchedModelIds(userId: string): Promise<string[]>;
  /** Replaces the user's followed models with exactly this set. */
  setWatchedModelIds(userId: string, modelIds: readonly string[]): Promise<void>;
  /** Follows a single model (no-op if already followed). */
  addWatchedModel(userId: string, modelId: string): Promise<void>;
  /** Unfollows a single model (no-op if not followed). */
  removeWatchedModel(userId: string, modelId: string): Promise<void>;
  /**
   * Every model followed by at least one user, listed once. The daily scan
   * uses this so a model followed by fifty people is still scraped once.
   */
  listDistinctWatchedModelIds(): Promise<string[]>;

  isOnboarded(userId: string): Promise<boolean>;
  markOnboarded(userId: string): Promise<void>;
}
