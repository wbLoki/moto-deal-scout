'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '../auth.js';
import type { SearchRange } from '../src/domain/entities/SearchCriteria.js';
import { saveUserSearchRange } from '../src/userSettings.js';
import { dispatchScanWorkflow } from '../src/infrastructure/github/dispatchScanWorkflow.js';
import type { ErrorKey } from './i18n/en.js';

export interface ActionResult {
  ok: boolean;
  /** Member-facing errors; mapped through the dictionary. */
  code?: ErrorKey;
  /** Admin-only scan copy (not translated). */
  message?: string;
}

/**
 * Persists the signed-in user's personal budget/year range. It's a view
 * filter, so it takes effect on their dashboard immediately (no scan needed).
 */
export async function saveSearchRangeAction(range: SearchRange): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 'not_signed_in' };
  try {
    await saveUserSearchRange(session.user.id, range);
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, code: 'save_failed' };
  }
}

/**
 * Starts a scan on demand. Admin-only. Scraping (Playwright) can't run on the
 * Cloudflare web host, so this triggers the scan GitHub Actions workflow; its
 * results land in the database when the run finishes, and the dashboard picks
 * them up on the next load.
 */
export async function scanNowAction(): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return { ok: false, message: 'Only an admin can run a scan.' };
  }
  try {
    await dispatchScanWorkflow();
    return {
      ok: true,
      message: 'Scan started on GitHub Actions — results appear here once it finishes.',
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not start the scan.' };
  }
}
