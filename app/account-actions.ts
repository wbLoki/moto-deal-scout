'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import { changeEmail, changePassword, updateName } from '../src/auth/userService.js';

export interface AccountState {
  ok?: boolean;
  message?: string;
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
  if (!session?.user?.id) return { message: 'Not signed in.' };
  try {
    await updateName(session.user.id, str(formData, 'name'));
    revalidatePath('/profile');
    return { ok: true, message: 'Name updated.' };
  } catch (err) {
    return { message: err instanceof Error ? err.message : 'Failed to update name.' };
  }
}

export async function changeEmailAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await auth();
  if (!session?.user?.id) return { message: 'Not signed in.' };
  try {
    await changeEmail(session.user.id, str(formData, 'currentPassword'), str(formData, 'email'));
    revalidatePath('/profile');
    return { ok: true, message: 'Email updated. Use it next time you sign in.' };
  } catch (err) {
    return { message: err instanceof Error ? err.message : 'Failed to change email.' };
  }
}

export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await auth();
  if (!session?.user?.id) return { message: 'Not signed in.' };
  const next = str(formData, 'newPassword');
  if (next !== str(formData, 'confirmPassword')) {
    return { message: 'New passwords do not match.' };
  }
  try {
    await changePassword(session.user.id, str(formData, 'currentPassword'), next);
    return { ok: true, message: 'Password changed.' };
  } catch (err) {
    return { message: err instanceof Error ? err.message : 'Failed to change password.' };
  }
}
