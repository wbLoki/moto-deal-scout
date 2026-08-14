import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import type { StoredModel } from './domain/entities/Model.js';
import type { SavedSearch } from './domain/entities/SavedSearch.js';
import type { VehicleType } from './domain/entities/VehicleType.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlSavedSearchRepository } from './infrastructure/persistence/libsql/LibsqlSavedSearchRepository.js';
import { LibsqlUserProfileRepository } from './infrastructure/persistence/libsql/LibsqlUserProfileRepository.js';
import { LibsqlUserRepository } from './infrastructure/persistence/libsql/LibsqlUserRepository.js';
import { seedModelsOnce } from './infrastructure/persistence/libsql/seedModelsOnce.js';

export interface UserProfile {
  readonly onboarded: boolean;
}

export interface ProfilePageData {
  readonly account: {
    email: string;
    name: string | undefined;
    hasPassword: boolean;
    phone: string | undefined;
    whatsappOptIn: boolean;
  } | null;
  readonly models: StoredModel[];
  readonly profile: UserProfile;
  readonly searches: readonly SavedSearch[];
}

/** The enabled models a user can choose to follow (id/brand/model matter for the picker). */
export async function listTrackedModels(): Promise<StoredModel[]> {
  const db = await openDatabaseFromEnv();
  try {
    const config = await loadCriteria(loadEnv().CRITERIA_CONFIG_PATH);
    await seedModelsOnce(db, config.models);
    return (await new LibsqlModelRepository(db).listAll()).filter((m) => m.enabled);
  } finally {
    db.close();
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const db = await openDatabaseFromEnv();
  try {
    const onboarded = await new LibsqlUserProfileRepository(db).isOnboarded(userId);
    return { onboarded };
  } finally {
    db.close();
  }
}

/**
 * Single DB open for the profile page (account + saved searches).
 */
export async function getProfilePageData(userId: string): Promise<ProfilePageData> {
  const db = await openDatabaseFromEnv();
  try {
    const users = new LibsqlUserRepository(db);
    const models = new LibsqlModelRepository(db);
    const profiles = new LibsqlUserProfileRepository(db);
    const searches = new LibsqlSavedSearchRepository(db);
    const config = await loadCriteria(loadEnv().CRITERIA_CONFIG_PATH);
    await seedModelsOnce(db, config.models);

    const [user, allModels, onboarded, saved] = await Promise.all([
      users.findById(userId),
      models.listAll(),
      profiles.isOnboarded(userId),
      searches.listForUser(userId),
    ]);

    return {
      account: user
        ? {
            email: user.email,
            name: user.name,
            hasPassword: Boolean(user.passwordHash),
            phone: user.phone,
            whatsappOptIn: user.whatsappOptIn,
          }
        : null,
      models: allModels.filter((m) => m.enabled),
      profile: { onboarded },
      searches: saved,
    };
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
  vehicleType: VehicleType = 'motorcycle',
): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    const models = new LibsqlModelRepository(db);
    const ofType = (await models.listAll()).filter((m) => m.vehicleType === vehicleType);
    const valid = new Set(ofType.map((m) => m.id));
    const filtered = modelIds.filter((id) => valid.has(id));

    const profile = new LibsqlUserProfileRepository(db);
    await profile.setWatchedModelIdsForType(userId, vehicleType, filtered);
    if (vehicleType === 'motorcycle') await profile.markOnboarded(userId);
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
