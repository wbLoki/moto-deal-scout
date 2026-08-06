'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import { removeModel, saveModel, setModelEnabled } from '../src/adminService.js';
import { calibrateModels } from '../src/calibration.js';

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
  };
}

/** Void form action for the per-model edit cards (the list re-renders on revalidate). */
export async function saveModelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await saveModel(modelInputFrom(formData));
  revalidatePath('/admin');
  revalidatePath('/');
}

export interface AdminModelState {
  ok?: boolean;
  message?: string;
}

export async function toggleModelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await setModelEnabled(str(formData, 'id'), str(formData, 'enabled') === 'true');
  revalidatePath('/admin');
  revalidatePath('/');
}

export async function deleteModelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await removeModel(str(formData, 'id'));
  revalidatePath('/admin');
  revalidatePath('/');
}

/** Recomputes fair-value ranges from market data now (admin-only). */
export async function recalibrateAction(): Promise<AdminModelState> {
  const session = await auth();
  if (session?.user?.role !== 'admin') return { message: 'Forbidden: admin only.' };
  try {
    const { calibrated, skipped } = await calibrateModels();
    revalidatePath('/admin');
    revalidatePath('/');
    return {
      ok: true,
      message: `Calibrated ${calibrated} model(s); ${skipped} skipped (not enough data).`,
    };
  } catch (err) {
    return { message: err instanceof Error ? err.message : 'Recalibration failed.' };
  }
}
