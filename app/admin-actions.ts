'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import { removeModel, saveModel, setModelEnabled } from '../src/adminService.js';

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

export async function saveModelAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const aliases = str(formData, 'aliases')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  await saveModel({
    id: str(formData, 'id') || undefined,
    brand: str(formData, 'brand'),
    model: str(formData, 'model'),
    aliases,
    priceMin: num(formData, 'priceMin'),
    priceMax: num(formData, 'priceMax'),
    maxMileageKm: num(formData, 'maxMileageKm'),
    minYear: num(formData, 'minYear'),
    enabled: formData.get('enabled') === 'on',
  });
  revalidatePath('/admin');
  revalidatePath('/');
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
