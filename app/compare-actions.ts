'use server';

import { z } from 'zod';
import { auth } from '../auth.js';
import {
  getAiEstimate,
  getBikeEvaluation,
  getPastedListingEvaluation,
  type BikeEvaluation,
  type BikeInput,
} from '../src/compareModel.js';
import { AiUnavailableError } from '../src/infrastructure/ai/AnthropicClient.js';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Input guard for the public evaluate action. Everything but brand/model is
 * optional; blank numeric fields arrive omitted, not as 0. `coerce` lets the
 * client pass strings straight from the form inputs.
 */
const schema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1950).max(CURRENT_YEAR + 1).optional(),
  mileageKm: z.coerce.number().int().min(0).max(2_000_000).optional(),
  priceMAD: z.coerce.number().int().min(0).max(100_000_000).optional(),
  city: z.string().trim().max(60).optional(),
});

export interface EvaluateResult {
  readonly ok: boolean;
  readonly evaluation?: BikeEvaluation;
  readonly error?: string;
}

/**
 * Public (no session): rates a user-entered bike and suggests a fair price.
 * Trusts only its validated input.
 */
export async function evaluateBikeAction(raw: unknown): Promise<EvaluateResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Please check your inputs and try again.' };
  try {
    const evaluation = await getBikeEvaluation(parsed.data);
    return { ok: true, evaluation };
  } catch {
    return { ok: false, error: 'Something went wrong evaluating this bike. Try again.' };
  }
}

/** Why an AI action was refused, so the client can prompt sign-in vs. show an error. */
export type AiFailReason = 'auth' | 'ai-unavailable' | 'invalid' | 'error';

export interface AiEvaluateResult {
  readonly ok: boolean;
  readonly evaluation?: BikeEvaluation;
  readonly reason?: AiFailReason;
  readonly error?: string;
}

/**
 * AI (signed-in only, because it costs per call): estimates a fair range with
 * Claude for a bike we don't have market data on, then scores against it.
 */
export async function estimateWithAiAction(raw: unknown): Promise<AiEvaluateResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: 'auth' };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid', error: 'Please check your inputs.' };
  try {
    const evaluation = await getAiEstimate(parsed.data);
    return { ok: true, evaluation };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { ok: false, reason: 'ai-unavailable', error: 'AI estimates aren’t configured yet.' };
    }
    return { ok: false, reason: 'error', error: 'The AI estimate failed. Try again.' };
  }
}

const pastedSchema = z.string().trim().min(10).max(4000);

export interface PastedListingActionResult {
  readonly ok: boolean;
  readonly extracted?: BikeInput;
  readonly evaluation?: BikeEvaluation;
  readonly reason?: AiFailReason;
  readonly error?: string;
}

/**
 * AI (signed-in only): parses a pasted ad with Claude into structured fields,
 * then rates it with the deterministic engine.
 */
export async function evaluatePastedListingAction(
  rawText: unknown,
): Promise<PastedListingActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: 'auth' };
  const parsed = pastedSchema.safeParse(rawText);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', error: 'Paste a bit more of the ad text.' };
  }
  try {
    const { extracted, evaluation } = await getPastedListingEvaluation(parsed.data);
    return { ok: true, extracted, evaluation };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { ok: false, reason: 'ai-unavailable', error: 'The AI reader isn’t configured yet.' };
    }
    // Surface enough for Cloudflare logs without leaking raw provider payloads to the UI.
    console.error(
      'evaluatePastedListingAction failed:',
      err instanceof Error ? err.message : err,
    );
    return { ok: false, reason: 'error', error: 'Couldn’t read that listing. Try again.' };
  }
}
