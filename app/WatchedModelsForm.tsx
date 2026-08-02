'use client';

import { useEffect, useMemo, useState } from 'react';
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
const MAX_RESULTS = 8;

/**
 * Model picker shared by onboarding and the profile page. A search box
 * filters the tracked models; picking one adds a chip. Selected ids are
 * submitted as hidden inputs so the existing server action is unchanged.
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

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const [selected, setSelected] = useState<string[]>(() => watchedIds.filter((id) => byId.has(id)));
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (state.ok && mode === 'onboarding') router.push('/');
  }, [state.ok, mode, router]);

  const selectedSet = new Set(selected);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return models
      .filter((m) => !selectedSet.has(m.id) && `${m.brand} ${m.model}`.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, models, selected]);

  const add = (id: string) => {
    setSelected((s) => (s.includes(id) ? s : [...s, id]));
    setQuery('');
  };
  const remove = (id: string) => setSelected((s) => s.filter((x) => x !== id));

  return (
    <form action={action} className="auth-form">
      {selected.map((id) => (
        <input key={id} type="hidden" name="models" value={id} />
      ))}

      {models.length === 0 ? (
        <p className="settings-hint">
          No models are being tracked yet. Check back after the admin adds some.
        </p>
      ) : (
        <div className="watch-picker">
          {selected.length > 0 && (
            <div className="chips">
              {selected.map((id) => {
                const m = byId.get(id);
                return (
                  <span key={id} className="chip">
                    {m ? `${m.brand} ${m.model}` : id}
                    <button type="button" onClick={() => remove(id)} aria-label="Remove">
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="model-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models to follow…"
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul className="search-results">
                {results.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => add(m.id)}>
                      {m.brand} {m.model}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim() && results.length === 0 && (
              <p className="settings-hint">No matching models.</p>
            )}
          </div>
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
