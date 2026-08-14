'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import { setSavedListing } from '../src/savedListings.js';
import { createSavedSearch, type SavedSearchInput } from '../src/savedSearches.js';
import type { ErrorKey } from './i18n/en.js';
import { errorKeyFromCaught } from './i18n/errorKey.js';

/**
 * Toggles saving a single listing (the bookmark button on deal cards). The
 * card key is "sourceId:externalId"; source ids never contain a colon, so we
 * split on the first one and keep the rest as the external id.
 */
export async function setSavedListingAction(key: string, saved: boolean): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };

  const colon = key.indexOf(':');
  if (colon <= 0) return { ok: false };
  const sourceId = key.slice(0, colon);
  const externalId = key.slice(colon + 1);

  try {
    await setSavedListing(session.user.id, sourceId, externalId, saved);
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Persists the current browse filters as a named saved search. */
export async function createSavedSearchAction(
  input: SavedSearchInput,
): Promise<{ ok: boolean; error?: ErrorKey }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'not_signed_in' };
  try {
    await createSavedSearch(session.user.id, input);
    revalidatePath('/');
    revalidatePath('/cars');
    revalidatePath('/profile');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorKeyFromCaught(err, 'save_failed') };
  }
}
