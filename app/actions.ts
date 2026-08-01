'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import type { SearchRange } from '../src/domain/entities/SearchCriteria.js';
import { saveUserSearchRange } from '../src/userSettings.js';
import { runScan } from '../src/runners.js';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Persists the signed-in user's personal budget/year range. It's a view
 * filter, so it takes effect on their dashboard immediately (no scan needed).
 */
export async function saveSearchRangeAction(range: SearchRange): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: 'Not signed in.' };
  try {
    await saveUserSearchRange(session.user.id, range);
    revalidatePath('/');
    return { ok: true, message: 'Range saved — your deals are filtered to it.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to save.' };
  }
}

/**
 * Runs a scan immediately. Admin-only: scanning is a shared, expensive
 * operation, not something each user triggers.
 */
export async function scanNowAction(): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return { ok: false, message: 'Only an admin can run a scan.' };
  }
  try {
    const report = await runScan();
    revalidatePath('/');
    return {
      ok: true,
      message: `Scan complete: ${report.newListingsSeen} new, ${report.goodDeals.length} good deal(s).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Scan failed.' };
  }
}
