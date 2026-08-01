'use client';

import { useState, useTransition } from 'react';
import type { SearchRange } from '../src/domain/entities/SearchCriteria.js';
import { saveSearchRangeAction, scanNowAction, type ActionResult } from './actions.js';

const CURRENT_YEAR = new Date().getFullYear();

export function SearchSettings({ current }: { current: SearchRange }) {
  const [budgetMin, setBudgetMin] = useState(current.budgetMin);
  const [budgetMax, setBudgetMax] = useState(current.budgetMax);
  const [yearMin, setYearMin] = useState(current.yearMin);
  const [yearMax, setYearMax] = useState(current.yearMax);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSave] = useTransition();
  const [scanning, startScan] = useTransition();

  const invalid = budgetMax < budgetMin || yearMax < yearMin;

  const save = () => {
    setStatus(null);
    startSave(async () => {
      const result = await saveSearchRangeAction({ budgetMin, budgetMax, yearMin, yearMax });
      setStatus(result);
    });
  };

  const scanNow = () => {
    setStatus(null);
    startScan(async () => {
      const result = await scanNowAction();
      setStatus(result);
    });
  };

  const busy = saving || scanning;

  return (
    <section className="settings">
      <div className="settings-head">
        <h2 className="settings-title">Search range</h2>
        <span className="settings-hint">
          Only listings within this budget and year window are kept.
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
            <input
              type="number"
              min={1980}
              max={CURRENT_YEAR + 1}
              value={yearMin}
              onChange={(e) => setYearMin(Number(e.target.value))}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="number"
              min={1980}
              max={CURRENT_YEAR + 1}
              value={yearMax}
              onChange={(e) => setYearMax(Number(e.target.value))}
            />
          </label>
        </fieldset>
      </div>

      {invalid && <p className="settings-error">Max must be greater than or equal to min.</p>}

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy || invalid} type="button">
          {saving ? 'Saving…' : 'Save range'}
        </button>
        <button className="btn" onClick={scanNow} disabled={busy} type="button">
          {scanning ? 'Scanning…' : 'Scan now'}
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
