'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import {
  approveModelRequest,
  rejectModelRequest,
  submitModelRequest,
} from '../src/requestService.js';

export interface RequestFormState {
  ok?: boolean;
  error?: string;
  /** Neutral note — e.g. the model is already tracked, so no request was filed. */
  message?: string;
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

/** Any signed-in user can submit a model request. */
export async function submitRequestAction(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not signed in.' };
  try {
    const result = await submitModelRequest(session.user.id, {
      brand: str(formData, 'brand'),
      model: str(formData, 'model'),
      note: str(formData, 'note').trim() || undefined,
    });
    if (result.status === 'duplicate') return { message: result.message };
    revalidatePath('/requests');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to submit request.' };
  }
}

async function requireAdminId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role === 'admin' ? session.user.id : null;
}

export async function approveRequestAction(formData: FormData): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) throw new Error('Forbidden: admin only.');
  await approveModelRequest(str(formData, 'id'), adminId);
  revalidatePath('/admin');
  revalidatePath('/');
}

export async function rejectRequestAction(formData: FormData): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) throw new Error('Forbidden: admin only.');
  await rejectModelRequest(str(formData, 'id'), adminId);
  revalidatePath('/admin');
}
