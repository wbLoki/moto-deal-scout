'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { auth } from '../../../auth.js';
import { PUBLIC_DASHBOARD_TAG } from '../../../src/readModel.js';
import {
  dismissReview,
  promoteReview,
  updateListingData,
  type PromoteInput,
} from '../../../src/reviewQueue.js';

async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== 'admin') throw new Error('Forbidden: admin only.');
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/** A positive integer from a form field, or undefined if blank/invalid. */
function posInt(formData: FormData, key: string): number | undefined {
  const raw = str(formData, key);
  if (!raw) return undefined;
  const n = Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function revalidateDashboards(): void {
  revalidatePath('/admin/review');
  revalidatePath('/admin');
  revalidatePath('/');
  revalidatePath('/cars');
  revalidateTag(PUBLIC_DASHBOARD_TAG);
}

export async function promoteReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const selected = str(formData, 'modelId');
  const newBrand = str(formData, 'newBrand');
  const newModel = str(formData, 'newModel');
  const year = posInt(formData, 'year');
  const mileageKm = posInt(formData, 'mileageKm');
  const displacementCc = posInt(formData, 'displacementCc');
  const input: PromoteInput = {
    sourceId: str(formData, 'sourceId'),
    externalId: str(formData, 'externalId'),
    // '__new__' (or blank) means "create the model from the brand/model fields".
    ...(selected && selected !== '__new__' ? { modelId: selected } : {}),
    ...(newBrand ? { newBrand } : {}),
    ...(newModel ? { newModel } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(mileageKm !== undefined ? { mileageKm } : {}),
    ...(displacementCc !== undefined ? { displacementCc } : {}),
    ...(str(formData, 'vehicleType') ? { vehicleType: str(formData, 'vehicleType') } : {}),
  };
  await promoteReview(input);
  revalidateDashboards();
}

export async function dismissReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await dismissReview(str(formData, 'sourceId'), str(formData, 'externalId'));
  revalidatePath('/admin/review');
}

export async function updateListingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const year = posInt(formData, 'year');
  const mileageKm = posInt(formData, 'mileageKm');
  const displacementCc = posInt(formData, 'displacementCc');
  await updateListingData(str(formData, 'sourceId'), str(formData, 'externalId'), {
    ...(year !== undefined ? { year } : {}),
    ...(mileageKm !== undefined ? { mileageKm } : {}),
    ...(displacementCc !== undefined ? { displacementCc } : {}),
  });
  revalidateDashboards();
}
