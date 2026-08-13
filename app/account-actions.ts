'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import { changeEmail, changePassword, updateName } from '../src/auth/userService.js';
import type { ErrorKey } from './i18n/en.js';
import { errorKeyFromCaught } from './i18n/errorKey.js';

export type AccountCode = ErrorKey | 'name_updated' | 'email_updated' | 'password_changed';

export interface AccountState {
  ok?: boolean;
  code?: AccountCode;
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

export async function updateNameAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await auth();
  if (!session?.user?.id) return { code: 'not_signed_in' };
  try {
    await updateName(session.user.id, str(formData, 'name'));
    revalidatePath('/profile');
    return { ok: true, code: 'name_updated' };
  } catch (err) {
    return { code: errorKeyFromCaught(err, 'name_update_failed') };
  }
}

export async function changeEmailAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await auth();
  if (!session?.user?.id) return { code: 'not_signed_in' };
  try {
    await changeEmail(session.user.id, str(formData, 'currentPassword'), str(formData, 'email'));
    revalidatePath('/profile');
    return { ok: true, code: 'email_updated' };
  } catch (err) {
    return { code: errorKeyFromCaught(err, 'email_change_failed') };
  }
}

export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await auth();
  if (!session?.user?.id) return { code: 'not_signed_in' };
  const next = str(formData, 'newPassword');
  if (next !== str(formData, 'confirmPassword')) {
    return { code: 'passwords_mismatch' };
  }
  try {
    await changePassword(session.user.id, str(formData, 'currentPassword'), next);
    return { ok: true, code: 'password_changed' };
  } catch (err) {
    return { code: errorKeyFromCaught(err, 'password_change_failed') };
  }
}
