'use client';

import { useState, useTransition } from 'react';
import type { SearchRange } from '../src/domain/entities/SearchCriteria.js';
import type { VehicleType } from '../src/domain/entities/VehicleType.js';
import { saveSearchRangeAction, type ActionResult } from './actions.js';
import { yearOptions } from './dealFilters.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

const YEARS = yearOptions();

export function SearchSettings({
  locale,
  current,
  vehicleType = 'motorcycle',
}: {
  locale: Locale;
  current: SearchRange;
  vehicleType?: VehicleType;
}) {
  const t = useT(locale);
  const [budgetMin, setBudgetMin] = useState(current.budgetMin);
  const [budgetMax, setBudgetMax] = useState(current.budgetMax);
  const [yearMin, setYearMin] = useState(current.yearMin);
  const [yearMax, setYearMax] = useState(current.yearMax);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSave] = useTransition();

  const invalid = budgetMax < budgetMin || yearMax < yearMin;

  const save = () => {
    setStatus(null);
    startSave(async () => {
      const result = await saveSearchRangeAction(
        { budgetMin, budgetMax, yearMin, yearMax },
        vehicleType,
      );
      setStatus(result);
    });
  };

  return (
    <section className="settings">
      <div className="settings-head">
        <h2 className="settings-title">{t.range.title}</h2>
        <span className="settings-hint">{t.range.hint}</span>
      </div>

      <div className="settings-grid">
        <fieldset className="field-group">
          <legend>{t.filters.budget}</legend>
          <label>
            <span>{t.common.min}</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={budgetMin}
              onChange={(e) => setBudgetMin(Number(e.target.value))}
            />
          </label>
          <label>
            <span>{t.common.max}</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={budgetMax}
              onChange={(e) => setBudgetMax(Number(e.target.value))}
            />
          </label>
        </fieldset>

        <fieldset className="field-group">
          <legend>{t.filters.year}</legend>
          <label>
            <span>{t.common.from}</span>
            <select value={yearMin} onChange={(e) => setYearMin(Number(e.target.value))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.common.to}</span>
            <select value={yearMax} onChange={(e) => setYearMax(Number(e.target.value))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      </div>

      {invalid && <p className="settings-error">{t.filters.rangeInvalid}</p>}

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={saving || invalid}
          type="button"
        >
          {saving ? t.range.saving : t.range.save}
        </button>
        {status && (
          <span className={status.ok ? 'settings-status ok' : 'settings-status err'}>
            {status.ok ? t.range.saved : t.errors[status.code ?? 'save_failed']}
          </span>
        )}
      </div>
    </section>
  );
}
