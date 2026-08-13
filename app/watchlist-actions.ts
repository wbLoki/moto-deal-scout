'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '../auth.js';
import { completeOnboarding, saveWatchedModels, setWatchedModel } from '../src/watchlist.js';
import type { ErrorKey } from './i18n/en.js';
import { errorKeyFromCaught } from './i18n/errorKey.js';

export interface WatchlistState {
  ok?: boolean;
  error?: ErrorKey;
}

/** Saves the picked models for the signed-in user (also completes onboarding). */
export async function saveWatchedModelsAction(
  _prev: WatchlistState,
  formData: FormData,
): Promise<WatchlistState> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'not_signed_in' };
  const modelIds = formData.getAll('models').filter((v): v is string => typeof v === 'string');
  try {
    await saveWatchedModels(session.user.id, modelIds);
    revalidatePath('/');
    revalidatePath('/profile');
    return { ok: true };
  } catch (err) {
    return { error: errorKeyFromCaught(err, 'watchlist_save_failed') };
  }
}

/** Finishes onboarding without following any models (the "Skip" button), then goes to the dashboard. */
export async function skipOnboardingAction(): Promise<void> {
  const session = await auth();
  if (session?.user?.id) {
    await completeOnboarding(session.user.id);
  }
  redirect('/');
}

/** Toggles following a single model (the eye button on deal cards). */
export async function setWatchedModelAction(
  modelId: string,
  watch: boolean,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  try {
    await setWatchedModel(session.user.id, modelId, watch);
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
