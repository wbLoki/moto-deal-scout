'use client';

import { useEffect } from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveWatchedModelsAction,
  skipOnboardingAction,
  type WatchlistState,
} from './watchlist-actions.js';

export interface PickableModel {
  id: string;
  brand: string;
  model: string;
}

const initial: WatchlistState = {};

/**
 * Model picker shared by onboarding and the profile page. In onboarding mode
 * it shows a Skip button and redirects to the dashboard on save; on the
 * profile it just confirms the save in place.
 */
export function WatchedModelsForm({
  models,
  watchedIds,
  mode,
}: {
  models: readonly PickableModel[];
  watchedIds: readonly string[];
  mode: 'onboarding' | 'profile';
}) {
  const [state, action, pending] = useActionState(saveWatchedModelsAction, initial);
  const router = useRouter();
  const watched = new Set(watchedIds);

  useEffect(() => {
    if (state.ok && mode === 'onboarding') router.push('/');
  }, [state.ok, mode, router]);

  return (
    <form action={action} className="auth-form">
      {models.length === 0 ? (
        <p className="settings-hint">
          No models are being tracked yet. Check back after the admin adds some.
        </p>
      ) : (
        <div className="model-picker">
          {models.map((m) => (
            <label key={m.id} className="pick">
              <input
                type="checkbox"
                name="models"
                value={m.id}
                defaultChecked={watched.has(m.id)}
              />
              <span>
                {m.brand} {m.model}
              </span>
            </label>
          ))}
        </div>
      )}

      {state.error && <p className="settings-error">{state.error}</p>}
      {state.ok && mode === 'profile' && <p className="settings-status ok">Saved.</p>}

      <div className="settings-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode === 'onboarding' ? 'Save & continue' : 'Save changes'}
        </button>
        {mode === 'onboarding' && (
          <button
            className="btn"
            type="submit"
            formAction={skipOnboardingAction}
            disabled={pending}
          >
            Skip for now
          </button>
        )}
      </div>
    </form>
  );
}
