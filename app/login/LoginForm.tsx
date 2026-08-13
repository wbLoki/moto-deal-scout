'use client';

import { useActionState } from 'react';
import { loginAction, type AuthFormState } from '../auth-actions.js';
import { useT } from '../i18n/I18nProvider.js';
import type { Locale } from '../i18n/locales.js';

const initial: AuthFormState = {};

export function LoginForm({ locale }: { locale: Locale }) {
  const t = useT(locale);
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="auth-form">
      <label className="auth-field">
        <span>{t.auth.email}</span>
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="auth-field">
        <span>{t.auth.password}</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && <p className="settings-error">{t.errors[state.error]}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? t.auth.signingIn : t.nav.signIn}
      </button>
    </form>
  );
}
