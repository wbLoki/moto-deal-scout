import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import type { StoredModel } from './domain/entities/Model.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';

export interface UserProfile {
  readonly onboarded: boolean;
  readonly watchedModelIds: readonly string[];
}

/** The enabled models a user can choose to follow (id/brand/model matter for the picker). */
export async function listTrackedModels(): Promise<StoredModel[]> {
  const db = await openDatabaseFromEnv();
  try {
    const repo = new LibsqlModelRepository(db);
    const config = await loadCriteria(loadEnv().CRITERIA_CONFIG_PATH);
    await repo.seedIfEmpty(config.models);
    return (await repo.listAll()).filter((m) => m.enabled);
  } finally {
    db.close();
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const db = await openDatabaseFromEnv();
  try {
    const repo = new LibsqlUserProfileRepository(db);
    const [onboarded, watchedModelIds] = await Promise.all([
      repo.isOnboarded(userId),
      repo.getWatchedModelIds(userId),
    ]);
    return { onboarded, watchedModelIds };
  } finally {
    db.close();
  }
}

/**
 * Saves the user's followed models and marks them onboarded (so this doubles
 * as "finish onboarding"). Unknown ids are dropped by filtering against the
 * current tracked models, so a stale checkbox can't persist a dead id.
 */
export async function saveWatchedModels(
  userId: string,
  modelIds: readonly string[],
): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    const models = new LibsqlModelRepository(db);
    const valid = new Set((await models.listAll()).map((m) => m.id));
    const filtered = modelIds.filter((id) => valid.has(id));

    const profile = new LibsqlUserProfileRepository(db);
    await profile.setWatchedModelIds(userId, filtered);
    await profile.markOnboarded(userId);
  } finally {
    db.close();
  }
}

/** Follows or unfollows a single model (used by the eye toggle on deal cards). */
export async function setWatchedModel(
  userId: string,
  modelId: string,
  watch: boolean,
): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    const repo = new LibsqlUserProfileRepository(db);
    if (watch) await repo.addWatchedModel(userId, modelId);
    else await repo.removeWatchedModel(userId, modelId);
  } finally {
    db.close();
  }
}

/** Marks onboarding complete without changing followed models (the "Skip" path). */
export async function completeOnboarding(userId: string): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlUserProfileRepository(db).markOnboarded(userId);
  } finally {
    db.close();
  }
}
