'use client';

import { useActionState } from 'react';
import { yearOptions } from './dealFilters.js';
import { createOnboardingSearchAction, skipOnboardingToHome, type SearchActionResult } from './search-actions.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';
import { DEFAULT_SEARCH_RANGE } from '../src/settingsModel.js';

const YEARS = yearOptions();
const initial: SearchActionResult = { ok: false };

export function OnboardingSearchForm({
  locale,
  brands,
}: {
  locale: Locale;
  brands: readonly string[];
}) {
  const t = useT(locale);
  const [state, action, pending] = useActionState(createOnboardingSearchAction, initial);
  const range = DEFAULT_SEARCH_RANGE;

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="vehicleType" value="motorcycle" />
      <label className="auth-field">
        <span>{t.profile.searchName}</span>
        <input type="text" name="name" defaultValue="Motos" required />
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
      {brands.length > 0 && (
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
      )}
      {state.error && <p className="settings-status err">{t.errors[state.error]}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? t.watchlist.saving : t.watchlist.saveContinue}
      </button>
      <button className="btn" type="submit" formAction={skipOnboardingToHome}>
        {t.watchlist.skip}
      </button>
    </form>
  );
}
