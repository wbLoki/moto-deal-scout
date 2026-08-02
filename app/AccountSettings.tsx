'use client';

import { useActionState } from 'react';
import {
  changeEmailAction,
  changePasswordAction,
  updateNameAction,
  type AccountState,
} from './account-actions.js';

const initial: AccountState = {};

function Status({ state }: { state: AccountState }) {
  if (!state.message) return null;
  return <p className={state.ok ? 'settings-status ok' : 'settings-status err'}>{state.message}</p>;
}

export function AccountSettings({
  email,
  name,
  hasPassword,
}: {
  email: string;
  name: string;
  hasPassword: boolean;
}) {
  const [nameState, nameAction, namePending] = useActionState(updateNameAction, initial);
  const [emailState, emailAction, emailPending] = useActionState(changeEmailAction, initial);
  const [pwState, pwAction, pwPending] = useActionState(changePasswordAction, initial);

  return (
    <div className="account">
      <form action={nameAction} className="auth-form account-form">
        <h3 className="account-form-title">Name</h3>
        <label className="auth-field">
          <span>Display name</span>
          <input type="text" name="name" defaultValue={name} required />
        </label>
        <Status state={nameState} />
        <button className="btn btn-primary" type="submit" disabled={namePending}>
          {namePending ? 'Saving…' : 'Save name'}
        </button>
      </form>

      {hasPassword ? (
        <>
          <form action={emailAction} className="auth-form account-form">
            <h3 className="account-form-title">Email</h3>
            <label className="auth-field">
              <span>New email</span>
              <input type="email" name="email" defaultValue={email} autoComplete="email" required />
            </label>
            <label className="auth-field">
              <span>Current password</span>
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </label>
            <Status state={emailState} />
            <button className="btn btn-primary" type="submit" disabled={emailPending}>
              {emailPending ? 'Saving…' : 'Change email'}
            </button>
          </form>

          <form action={pwAction} className="auth-form account-form">
            <h3 className="account-form-title">Password</h3>
            <label className="auth-field">
              <span>Current password</span>
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </label>
            <label className="auth-field">
              <span>New password</span>
              <input
                type="password"
                name="newPassword"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="auth-field">
              <span>Confirm new password</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <Status state={pwState} />
            <button className="btn btn-primary" type="submit" disabled={pwPending}>
              {pwPending ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </>
      ) : (
        <p className="settings-hint account-form">
          You signed in with a social account, so your email ({email}) and password are managed by
          that provider.
        </p>
      )}
    </div>
  );
}
