'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import type { SavedSearch } from '../src/domain/entities/SavedSearch.js';
import type { VehicleType } from '../src/domain/entities/VehicleType.js';
import { defaultSearchRangeFor } from '../src/settingsModel.js';
import { yearOptions } from './dealFilters.js';
import { ModelPicker, type PickableModel } from './ModelPicker.js';
import {
  createProfileSearchAction,
  deleteSavedSearchAction,
  type SearchActionResult,
} from './search-actions.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

const YEARS = yearOptions();
const madFmt = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 });
const initial: SearchActionResult = { ok: false };

export function SavedSearchesForm({
  locale,
  vehicleType,
  searches,
  brands,
  models,
}: {
  locale: Locale;
  vehicleType: VehicleType;
  searches: readonly SavedSearch[];
  brands: readonly string[];
  models: readonly PickableModel[];
}) {
  const t = useT(locale);
  const ofType = searches.filter((s) => s.vehicleType === vehicleType);
  const [state, action, pending] = useActionState(createProfileSearchAction, initial);
  const [, startDelete] = useTransition();
  const [mode, setMode] = useState<'criteria' | 'models'>('criteria');
  const range = defaultSearchRangeFor(vehicleType);
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const modelLabel = (id: string) => {
    const m = modelById.get(id);
    return m ? `${m.brand} ${m.model}` : id;
  };

  return (
    <div className="saved-searches">
      {ofType.length === 0 ? (
        <p className="settings-hint">{t.profile.noSearches}</p>
      ) : (
        <ul className="saved-search-list">
          {ofType.map((s) => (
            <li key={s.id} className="saved-search-item">
              <div>
                <strong>{s.name}</strong>
                <p className="settings-hint">
                  {t.profile.searchSummary(
                    `${madFmt.format(s.budgetMin)}–${madFmt.format(s.budgetMax)}`,
                    `${s.yearMin}–${s.yearMax}`,
                  )}
                  {s.modelIds.length > 0
                    ? ` · ${s.modelIds.map(modelLabel).join(', ')}`
                    : s.brands.length > 0
                      ? ` · ${s.brands.join(', ')}`
                      : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  startDelete(async () => {
                    await deleteSavedSearchAction(s.id);
                  });
                }}
              >
                {t.profile.deleteSearch}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="auth-form">
        <h3 className="account-form-title">{t.profile.newSearch}</h3>
        <input type="hidden" name="vehicleType" value={vehicleType} />

        <div className="watch-mode-toggle" role="group" aria-label={t.profile.watchBy}>
          <button
            type="button"
            className={mode === 'criteria' ? 'btn btn-primary' : 'btn'}
            aria-pressed={mode === 'criteria'}
            onClick={() => setMode('criteria')}
          >
            {t.profile.byCriteria}
          </button>
          <button
            type="button"
            className={mode === 'models' ? 'btn btn-primary' : 'btn'}
            aria-pressed={mode === 'models'}
            onClick={() => setMode('models')}
          >
            {t.profile.byModels}
          </button>
        </div>

        <label className="auth-field">
          <span>{t.profile.searchName}</span>
          <input
            type="text"
            name="name"
            defaultValue={vehicleType === 'car' ? 'Cars' : 'Motos'}
            required
          />
        </label>
        <div className="sidebar-row">
          <label>
            <span>{t.filters.budget} min</span>
            <input type="number" name="budgetMin" defaultValue={range.budgetMin} min={0} step={1000} />
          </label>
          <label>
            <span>{t.filters.budget} max</span>
            <input type="number" name="budgetMax" defaultValue={range.budgetMax} min={0} step={1000} />
          </label>
        </div>
        <div className="sidebar-row">
          <label>
            <span>{t.common.from}</span>
            <select name="yearMin" defaultValue={range.yearMin}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.common.to}</span>
            <select name="yearMax" defaultValue={range.yearMax}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mode === 'criteria'
          ? brands.length > 0 && (
              <label className="auth-field">
                <span>{t.filters.brand}</span>
                <select name="brands" multiple size={Math.min(6, brands.length)}>
                  {brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            )
          : (
              <div className="auth-field">
                <span>{t.profile.pickModels}</span>
                <ModelPicker name="modelIds" models={models} locale={locale} />
              </div>
            )}
        {state.error && <p className="settings-status err">{t.errors[state.error]}</p>}
        {state.ok && <p className="settings-status ok">{t.card.searchSaved}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? t.range.saving : t.profile.createSearch}
        </button>
      </form>
    </div>
  );
}
