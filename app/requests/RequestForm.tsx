'use client';

import { useActionState } from 'react';
import { submitRequestAction, type RequestFormState } from '../request-actions.js';

const initial: RequestFormState = {};

export function RequestForm() {
  const [state, action, pending] = useActionState(submitRequestAction, initial);
  return (
    <form action={action} className="auth-form">
      <div className="model-grid">
        <label>
          <span>Brand</span>
          <input name="brand" placeholder="e.g. Honda" required />
        </label>
        <label>
          <span>Model</span>
          <input name="model" placeholder="e.g. CB500X" required />
        </label>
      </div>
      <label className="auth-field">
        <span>Note (optional)</span>
        <input name="note" placeholder="Why, or any detail for the admin" />
      </label>
      {state.error && <p className="settings-error">{state.error}</p>}
      {state.message && <p className="settings-hint">{state.message}</p>}
      {state.ok && (
        <p className="settings-status ok">Request submitted — pending admin approval.</p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Request model'}
      </button>
    </form>
  );
}
