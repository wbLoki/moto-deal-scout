'use client';

import { useActionState } from 'react';
import { submitRequestAction, type RequestFormState } from '../request-actions.js';
import { useT } from '../i18n/I18nProvider.js';
import type { Locale } from '../i18n/locales.js';

const initial: RequestFormState = {};

export function RequestForm({ locale }: { locale: Locale }) {
  const t = useT(locale);
  const [state, action, pending] = useActionState(submitRequestAction, initial);
  const duplicateNote =
    state.duplicate === 'already_tracked' && state.brand && state.model
      ? t.requests.alreadyTracked(state.brand, state.model)
      : state.duplicate === 'in_catalog' && state.brand && state.model
        ? t.requests.inCatalog(state.brand, state.model)
        : null;
  return (
    <form action={action} className="auth-form">
      <div className="model-grid">
        <label>
          <span>{t.requests.brand}</span>
          <input name="brand" placeholder={t.requests.brandPlaceholder} required />
        </label>
        <label>
          <span>{t.requests.model}</span>
          <input name="model" placeholder={t.requests.modelPlaceholder} required />
        </label>
      </div>
      <label className="auth-field">
        <span>{t.requests.note}</span>
        <input name="note" placeholder={t.requests.notePlaceholder} />
      </label>
      {state.error && <p className="settings-error">{t.errors[state.error]}</p>}
      {duplicateNote && <p className="settings-hint">{duplicateNote}</p>}
      {state.ok && <p className="settings-status ok">{t.requests.submitted}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? t.requests.submitting : t.requests.submit}
      </button>
    </form>
  );
}
