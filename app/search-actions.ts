'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '../auth.js';
import { completeOnboarding } from '../src/watchlist.js';
import {
  createSavedSearch,
  deleteSavedSearch,
  type SavedSearchInput,
} from '../src/savedSearches.js';
import { parseVehicleType } from '../src/domain/entities/VehicleType.js';
import type { ErrorKey } from './i18n/en.js';
import { errorKeyFromCaught } from './i18n/errorKey.js';

export interface SearchActionResult {
  readonly ok: boolean;
  readonly error?: ErrorKey;
}

function strList(form: FormData, key: string): string[] {
  return form.getAll(key).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

function num(form: FormData, key: string, fallback: number): number {
  const v = form.get(key);
  const n = typeof v === 'string' ? Number(v) : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function inputFromForm(form: FormData): SavedSearchInput {
  const rawType = form.get('vehicleType');
  return {
    name: typeof form.get('name') === 'string' ? (form.get('name') as string) : '',
    vehicleType: parseVehicleType(typeof rawType === 'string' ? rawType : 'motorcycle'),
    budgetMin: num(form, 'budgetMin', 0),
    budgetMax: num(form, 'budgetMax', 200000),
    yearMin: num(form, 'yearMin', 2015),
    yearMax: num(form, 'yearMax', new Date().getFullYear() + 1),
    mileageMax: num(form, 'mileageMax', 0),
    brands: strList(form, 'brands'),
    cities: strList(form, 'cities'),
    fuelTypes: strList(form, 'fuelTypes'),
    gearboxes: strList(form, 'gearboxes'),
    modelIds: strList(form, 'modelIds'),
  };
}

export async function createOnboardingSearchAction(
  _prev: SearchActionResult,
  formData: FormData,
): Promise<SearchActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'not_signed_in' };
  try {
    await createSavedSearch(session.user.id, inputFromForm(formData), {
      completeOnboarding: true,
    });
  } catch (err) {
    return { ok: false, error: errorKeyFromCaught(err, 'save_failed') };
  }
  revalidatePath('/');
  revalidatePath('/profile');
  redirect('/');
}

export async function createProfileSearchAction(
  _prev: SearchActionResult,
  formData: FormData,
): Promise<SearchActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'not_signed_in' };
  try {
    await createSavedSearch(session.user.id, inputFromForm(formData));
    revalidatePath('/');
    revalidatePath('/cars');
    revalidatePath('/profile');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorKeyFromCaught(err, 'save_failed') };
  }
}

export async function deleteSavedSearchAction(id: string): Promise<SearchActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'not_signed_in' };
  try {
    await deleteSavedSearch(session.user.id, id);
    revalidatePath('/');
    revalidatePath('/cars');
    revalidatePath('/profile');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorKeyFromCaught(err, 'save_failed') };
  }
}

export async function skipOnboardingToHome(): Promise<void> {
  const session = await auth();
  if (session?.user?.id) await completeOnboarding(session.user.id);
  redirect('/');
}
