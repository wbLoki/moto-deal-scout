'use server';

import { auth } from '../auth.js';
import type { TabCounts } from '../src/domain/interfaces/ListingRepository.js';
import { getDealsPage, type DealsPageInput } from '../src/readModel.js';
import { toDealView, type DealView } from './dealView.js';

const EMPTY_COUNTS: TabCounts = { all: 0, daily: 0, watched: 0, saved: 0 };

export interface DealsPageResult {
  readonly ok: boolean;
  readonly deals: DealView[];
  readonly total: number;
  readonly tabCounts: TabCounts;
}

/**
 * Answers one dashboard filter/sort/page request. The user is resolved from the
 * session (never trusted from the client); `pageSize` and the budget/year range
 * are applied server-side, so the input only carries the view controls.
 */
export async function fetchDealsPageAction(input: DealsPageInput): Promise<DealsPageResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, deals: [], total: 0, tabCounts: EMPTY_COUNTS };
  }
  try {
    const page = await getDealsPage(session.user.id, input);
    return {
      ok: true,
      deals: page.deals.map(toDealView),
      total: page.total,
      tabCounts: page.tabCounts,
    };
  } catch {
    return { ok: false, deals: [], total: 0, tabCounts: EMPTY_COUNTS };
  }
}
