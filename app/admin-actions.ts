'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { auth } from '../auth.js';
import { removeModel, saveModel, setModelEnabled } from '../src/adminService.js';
import { calibrateModels } from '../src/calibration.js';
import { PUBLIC_DASHBOARD_TAG } from '../src/readModel.js';

function revalidatePublicHome(): void {
  revalidatePath('/');
  revalidatePath('/cars');
  revalidateTag(PUBLIC_DASHBOARD_TAG);
}

async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== 'admin') throw new Error('Forbidden: admin only.');
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}
function num(formData: FormData, key: string): number {
  return Number(str(formData, key));
}

function modelInputFrom(formData: FormData) {
  return {
    id: str(formData, 'id') || undefined,
    brand: str(formData, 'brand'),
    model: str(formData, 'model'),
    aliases: str(formData, 'aliases')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    priceMin: num(formData, 'priceMin'),
    priceMax: num(formData, 'priceMax'),
    maxMileageKm: num(formData, 'maxMileageKm'),
    minYear: num(formData, 'minYear'),
    enabled: formData.get('enabled') === 'on',
    autoCalibrate: formData.get('autoCalibrate') === 'on',
    vehicleType: str(formData, 'vehicleType') === 'car' ? 'car' : 'motorcycle',
  };
}

/** Void form action for the per-model edit cards (the list re-renders on revalidate). */
export async function saveModelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await saveModel(modelInputFrom(formData));
  revalidatePath('/admin');
  revalidatePublicHome();
}

export interface AdminModelState {
  ok?: boolean;
  message?: string;
}

export async function toggleModelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await setModelEnabled(str(formData, 'id'), str(formData, 'enabled') === 'true');
  revalidatePath('/admin');
  revalidatePublicHome();
}

export async function deleteModelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await removeModel(str(formData, 'id'));
  revalidatePath('/admin');
  revalidatePublicHome();
}

/** Recomputes fair-value ranges from market data now (admin-only). */
export async function recalibrateAction(): Promise<AdminModelState> {
  const session = await auth();
  if (session?.user?.role !== 'admin') return { message: 'Forbidden: admin only.' };
  try {
    const { calibrated, skipped } = await calibrateModels();
    revalidatePath('/admin');
    revalidatePublicHome();
    return {
      ok: true,
      message: `Calibrated ${calibrated} model(s); ${skipped} skipped (not enough data).`,
    };
  } catch (err) {
    return { message: err instanceof Error ? err.message : 'Recalibration failed.' };
  }
}
