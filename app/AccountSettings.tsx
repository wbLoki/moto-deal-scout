'use client';

import { useActionState } from 'react';
import {
  changeEmailAction,
  changePasswordAction,
  updateNameAction,
  type AccountState,
} from './account-actions.js';
import { useT } from './i18n/I18nProvider.js';
import type { Locale } from './i18n/locales.js';

const initial: AccountState = {};

function Status({ state, locale }: { state: AccountState; locale: Locale }) {
  const t = useT(locale);
  if (!state.code) return null;
  const text =
    state.code === 'name_updated'
      ? t.account.nameUpdated
      : state.code === 'email_updated'
        ? t.account.emailUpdated
        : state.code === 'password_changed'
          ? t.account.passwordChanged
          : state.code === 'whatsapp_updated'
            ? t.profile.whatsappUpdated
            : t.errors[state.code];
  return <p className={state.ok ? 'settings-status ok' : 'settings-status err'}>{text}</p>;
}

export function AccountSettings({
  locale,
  email,
  name,
  hasPassword,
}: {
  locale: Locale;
  email: string;
  name: string;
  hasPassword: boolean;
}) {
  const t = useT(locale);
  const [nameState, nameAction, namePending] = useActionState(updateNameAction, initial);
  const [emailState, emailAction, emailPending] = useActionState(changeEmailAction, initial);
  const [pwState, pwAction, pwPending] = useActionState(changePasswordAction, initial);

  return (
    <div className="account">
      <form action={nameAction} className="auth-form account-form">
        <h3 className="account-form-title">{t.account.name}</h3>
        <label className="auth-field">
          <span>{t.account.displayName}</span>
          <input type="text" name="name" defaultValue={name} required />
        </label>
        <Status state={nameState} locale={locale} />
        <button className="btn btn-primary" type="submit" disabled={namePending}>
          {namePending ? t.range.saving : t.account.saveName}
        </button>
      </form>

      {hasPassword ? (
        <>
          <form action={emailAction} className="auth-form account-form">
            <h3 className="account-form-title">{t.account.email}</h3>
            <label className="auth-field">
              <span>{t.account.newEmail}</span>
              <input type="email" name="email" defaultValue={email} autoComplete="email" required />
            </label>
            <label className="auth-field">
              <span>{t.account.currentPassword}</span>
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </label>
            <Status state={emailState} locale={locale} />
            <button className="btn btn-primary" type="submit" disabled={emailPending}>
              {emailPending ? t.range.saving : t.account.changeEmail}
            </button>
          </form>

          <form action={pwAction} className="auth-form account-form">
            <h3 className="account-form-title">{t.account.password}</h3>
            <label className="auth-field">
              <span>{t.account.currentPassword}</span>
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </label>
            <label className="auth-field">
              <span>{t.account.newPassword}</span>
              <input
                type="password"
                name="newPassword"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="auth-field">
              <span>{t.account.confirmPassword}</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <Status state={pwState} locale={locale} />
            <button className="btn btn-primary" type="submit" disabled={pwPending}>
              {pwPending ? t.range.saving : t.account.changePassword}
            </button>
          </form>
        </>
      ) : (
        <p className="settings-hint account-form">{t.account.oauthHint(email)}</p>
      )}

      <div className="account-form">
        <h3 className="account-form-title">{t.profile.whatsapp}</h3>
        <p className="settings-hint">{t.profile.whatsappHint}</p>
        <div className="scan-now">
          <button className="btn" type="button" disabled>
            {t.profile.whatsapp}
          </button>
          <span className="status-pill">{t.home.comingSoon}</span>
        </div>
      </div>
    </div>
  );
}
