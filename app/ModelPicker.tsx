'use client';

import { useMemo, useState } from 'react';
import { CloseIcon } from './icons.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

export interface PickableModel {
  id: string;
  brand: string;
  model: string;
}

const MAX_RESULTS = 8;

/**
 * Search-and-chip picker for tracked models. Selected ids are emitted as
 * hidden inputs named `name`, so a plain form submit carries them straight
 * into a saved search's `modelIds`. Shared by the profile and onboarding
 * "watch specific models" mode.
 */
export function ModelPicker({
  models,
  name,
  initial = [],
  locale,
}: {
  models: readonly PickableModel[];
  name: string;
  initial?: readonly string[];
  locale: Locale;
}) {
  const t = useT(locale);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const [selected, setSelected] = useState<string[]>(() => initial.filter((id) => byId.has(id)));
  const [query, setQuery] = useState('');

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

  if (models.length === 0) {
    return <p className="settings-hint">{t.watchlist.noModels}</p>;
  }

  return (
    <div className="watch-picker">
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {selected.length > 0 && (
        <div className="chips">
          {selected.map((id) => {
            const m = byId.get(id);
            return (
              <span key={id} className="chip">
                {m ? `${m.brand} ${m.model}` : id}
                <button type="button" onClick={() => remove(id)} aria-label={t.common.remove}>
                  <CloseIcon size={14} />
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
          placeholder={t.watchlist.search}
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
          <p className="settings-hint">{t.watchlist.noMatch}</p>
        )}
      </div>
    </div>
  );
}
