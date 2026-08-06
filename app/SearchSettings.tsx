'use client';

import { useState, useTransition } from 'react';
import type { SearchRange } from '../src/domain/entities/SearchCriteria.js';
import { saveSearchRangeAction, type ActionResult } from './actions.js';
import { yearOptions } from './dealFilters.js';

const YEARS = yearOptions();

export function SearchSettings({ current }: { current: SearchRange }) {
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
      const result = await saveSearchRangeAction({ budgetMin, budgetMax, yearMin, yearMax });
      setStatus(result);
    });
  };

  return (
    <section className="settings">
      <div className="settings-head">
        <h2 className="settings-title">Your range</h2>
        <span className="settings-hint">
          Your dashboard shows only deals within this budget and year window.
        </span>
      </div>

      <div className="settings-grid">
        <fieldset className="field-group">
          <legend>Budget (MAD)</legend>
          <label>
            <span>Min</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={budgetMin}
              onChange={(e) => setBudgetMin(Number(e.target.value))}
            />
          </label>
          <label>
            <span>Max</span>
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
          <legend>Model year</legend>
          <label>
            <span>From</span>
            <select value={yearMin} onChange={(e) => setYearMin(Number(e.target.value))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>To</span>
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

      {invalid && <p className="settings-error">Max must be greater than or equal to min.</p>}

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={saving || invalid}
          type="button"
        >
          {saving ? 'Saving…' : 'Save range'}
        </button>
        {status && (
          <span className={status.ok ? 'settings-status ok' : 'settings-status err'}>
            {status.message}
          </span>
        )}
      </div>
    </section>
  );
}
