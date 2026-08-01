'use server';

import { revalidatePath } from 'next/cache';
import type { SearchRange } from '../src/domain/entities/SearchCriteria.js';
import { saveSearchRange } from '../src/settingsModel.js';
import { runScan } from '../src/runners.js';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Persists the search range from the settings form. Runs server-side, so
 * it talks to the database directly — no HTTP round-trip, no exposed
 * endpoint or secret.
 */
export async function saveSearchRangeAction(range: SearchRange): Promise<ActionResult> {
  try {
    await saveSearchRange(range);
    revalidatePath('/');
    return { ok: true, message: 'Search range saved. It applies on the next scan.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to save.' };
  }
}

/**
 * Runs a scan immediately using the currently-saved settings. This scrapes
 * live, so it can take a while and is bounded by the route's maxDuration.
 */
export async function scanNowAction(): Promise<ActionResult> {
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
