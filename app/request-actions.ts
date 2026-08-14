'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { auth } from '../auth.js';
import {
  approveModelRequest,
  rejectModelRequest,
  submitModelRequest,
} from '../src/requestService.js';
import { PUBLIC_DASHBOARD_TAG } from '../src/readModel.js';
import { parseVehicleType } from '../src/domain/entities/VehicleType.js';
import type { ErrorKey } from './i18n/en.js';
import { errorKeyFromCaught } from './i18n/errorKey.js';

export type DuplicateRequestCode = 'already_tracked' | 'in_catalog';

export interface RequestFormState {
  ok?: boolean;
  error?: ErrorKey;
  duplicate?: DuplicateRequestCode;
  brand?: string;
  model?: string;
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
  if (!session?.user?.id) return { error: 'not_signed_in' };
  try {
    const result = await submitModelRequest(session.user.id, {
      brand: str(formData, 'brand'),
      model: str(formData, 'model'),
      note: str(formData, 'note').trim() || undefined,
      vehicleType: parseVehicleType(str(formData, 'vehicleType')),
    });
    if (result.status === 'duplicate') {
      return {
        duplicate: result.code,
        brand: result.brand,
        model: result.model,
      };
    }
    revalidatePath('/requests');
    revalidatePath('/cars/requests');
    return { ok: true };
  } catch (err) {
    return { error: errorKeyFromCaught(err, 'request_failed') };
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
  revalidateTag(PUBLIC_DASHBOARD_TAG);
}

export async function rejectRequestAction(formData: FormData): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) throw new Error('Forbidden: admin only.');
  await rejectModelRequest(str(formData, 'id'), adminId);
  revalidatePath('/admin');
}
