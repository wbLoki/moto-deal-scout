'use server';

import { AuthError } from 'next-auth';
import { signIn, signOut } from '../auth.js';
import { registerUser } from '../src/auth/userService.js';
import type { ErrorKey } from './i18n/en.js';
import { errorKeyFromCaught } from './i18n/errorKey.js';

export interface AuthFormState {
  error?: ErrorKey;
}

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Creates an email+password account, then signs the new user in. */
export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, 'email');
  const password = field(formData, 'password');
  const name = field(formData, 'name').trim() || undefined;

  try {
    await registerUser({ email, password, name });
  } catch (err) {
    return { error: errorKeyFromCaught(err, 'signup_failed') };
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'account_created_login' };
    }
    throw err;
  }
  return {};
}

/** Signs in with email+password. */
export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, 'email');
  const password = field(formData, 'password');

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'invalid_credentials' };
    }
    throw err;
  }
  return {};
}

/** Starts an OAuth sign-in flow (bound to a provider id at the call site). */
export async function oauthSignInAction(provider: 'google' | 'github'): Promise<void> {
  await signIn(provider, { redirectTo: '/' });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}
