'use client';

import { useActionState } from 'react';
import { loginAction, type AuthFormState } from '../auth-actions.js';

const initial: AuthFormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="auth-form">
      <label className="auth-field">
        <span>Email</span>
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && <p className="settings-error">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
