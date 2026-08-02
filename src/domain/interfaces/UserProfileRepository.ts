/**
 * Per-user profile state that isn't authentication: which models they
 * follow, and whether they've been through onboarding.
 */
export interface UserProfileRepository {
  /** Model ids the user follows. */
  getWatchedModelIds(userId: string): Promise<string[]>;
  /** Replaces the user's followed models with exactly this set. */
  setWatchedModelIds(userId: string, modelIds: readonly string[]): Promise<void>;

  isOnboarded(userId: string): Promise<boolean>;
  markOnboarded(userId: string): Promise<void>;
}
