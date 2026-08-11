'use server';

import { auth } from '../auth.js';
import { reviewCalibratedRanges, type RangeReviewPage } from '../src/aiAdminService.js';
import { AiUnavailableError } from '../src/infrastructure/ai/AnthropicClient.js';

export interface ReviewPricesResult {
  readonly ok: boolean;
  readonly page?: RangeReviewPage;
  readonly error?: string;
}

/** Admin-only: reviews one batch of calibrated fair ranges with Claude. */
export async function reviewPricesAction(offset: number): Promise<ReviewPricesResult> {
  const session = await auth();
  if (session?.user?.role !== 'admin') return { ok: false, error: 'Forbidden: admin only.' };
  try {
    const page = await reviewCalibratedRanges(Number.isFinite(offset) ? offset : 0);
    return { ok: true, page };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { ok: false, error: 'AI is not configured — set ANTHROPIC_API_KEY.' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Review failed.' };
  }
}
