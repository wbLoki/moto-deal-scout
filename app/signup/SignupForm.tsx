'use client';

import { useActionState } from 'react';
import { signupAction, type AuthFormState } from '../auth-actions.js';

const initial: AuthFormState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initial);
  return (
    <form action={action} className="auth-form">
      <label className="auth-field">
        <span>Name (optional)</span>
        <input type="text" name="name" autoComplete="name" />
      </label>
      <label className="auth-field">
        <span>Email</span>
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input type="password" name="password" autoComplete="new-password" minLength={8} required />
      </label>
      {state.error && <p className="settings-error">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
