'use client';

import { useState, useTransition } from 'react';
import { recalibrateAction, type AdminModelState } from './admin-actions.js';

/** Admin button to recompute fair-value ranges from market data on demand. */
export function RecalibrateButton() {
  const [state, setState] = useState<AdminModelState | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="scan-now">
      <button
        className="btn"
        type="button"
        disabled={pending}
        onClick={() => {
          setState(null);
          start(async () => setState(await recalibrateAction()));
        }}
      >
        {pending ? 'Calibrating…' : 'Recalibrate from market'}
      </button>
      {state?.message && (
        <span className={state.ok ? 'settings-status ok' : 'settings-status err'}>
          {state.message}
        </span>
      )}
    </div>
  );
}
