'use server';

import { z } from 'zod';
import { auth } from '../auth.js';
import {
  getAiEstimate,
  getBikeEvaluation,
  getPastedListingEvaluation,
  ListingUrlScanError,
  type BikeEvaluation,
  type BikeInput,
} from '../src/compareModel.js';
import { AiUnavailableError } from '../src/infrastructure/ai/AnthropicClient.js';
import type { ErrorKey } from './i18n/en.js';
import type { VehicleType } from '../src/domain/entities/VehicleType.js';

const CURRENT_YEAR = new Date().getFullYear();

/** Empty / nullish wire values → omitted; otherwise coerce to an int in range. */
function optionalInt(min: number, max: number) {
  return z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value === 'number' && Number.isNaN(value)) return undefined;
    return value;
  }, z.coerce.number().int().min(min).max(max).optional());
}

/**
 * Input guard for the public evaluate action. Everything but brand/model is
 * optional; blank numeric fields arrive omitted, not as 0. `coerce` lets the
 * client pass strings straight from the form inputs. Nulls from the server-action
 * wire format are treated as omitted (empty optional fields).
 */
const schema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: optionalInt(1950, CURRENT_YEAR + 1),
  mileageKm: optionalInt(0, 2_000_000),
  displacementCc: optionalInt(25, 3500),
  priceMAD: optionalInt(0, 100_000_000),
  city: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.string().trim().max(60).optional(),
  ),
  vehicleType: z.enum(['motorcycle', 'car']).optional(),
});

export interface EvaluateResult {
  readonly ok: boolean;
  readonly evaluation?: BikeEvaluation;
  readonly error?: ErrorKey;
}

/**
 * Public (no session): rates a user-entered bike and suggests a fair price.
 * Trusts only its validated input.
 */
export async function evaluateBikeAction(raw: unknown): Promise<EvaluateResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'check_inputs' };
  try {
    const { vehicleType, ...rest } = parsed.data;
    const evaluation = await getBikeEvaluation({
      ...rest,
      ...(vehicleType ? { vehicleType } : {}),
    });
    return { ok: true, evaluation };
  } catch {
    return { ok: false, error: 'evaluate_failed' };
  }
}

/** Why an AI action was refused, so the client can prompt sign-in vs. show an error. */
export type AiFailReason = 'auth' | 'ai-unavailable' | 'invalid' | 'error';

export interface AiEvaluateResult {
  readonly ok: boolean;
  readonly evaluation?: BikeEvaluation;
  readonly reason?: AiFailReason;
  readonly error?: ErrorKey;
}

/**
 * AI (signed-in only, because it costs per call): estimates a fair range with
 * Claude for a bike we don't have market data on, then scores against it.
 */
export async function estimateWithAiAction(raw: unknown): Promise<AiEvaluateResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: 'auth' };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid', error: 'check_inputs' };
  try {
    const { vehicleType, ...rest } = parsed.data;
    const evaluation = await getAiEstimate({
      ...rest,
      ...(vehicleType ? { vehicleType } : {}),
    });
    return { ok: true, evaluation };
  } catch (err) {
    if (
      err instanceof AiUnavailableError ||
      (err instanceof Error && err.name === 'AiUnavailableError')
    ) {
      return { ok: false, reason: 'ai-unavailable', error: 'ai_unavailable' };
    }
    return { ok: false, reason: 'error', error: 'ai_estimate_failed' };
  }
}

const pastedSchema = z.string().trim().min(10).max(4000);

export interface PastedListingActionResult {
  readonly ok: boolean;
  readonly extracted?: BikeInput;
  readonly evaluation?: BikeEvaluation;
  readonly reason?: AiFailReason;
  readonly error?: ErrorKey;
}

/**
 * AI (signed-in only): parses a pasted ad with Claude into structured fields,
 * then rates it with the deterministic engine.
 */
export async function evaluatePastedListingAction(
  rawText: unknown,
  vehicleType: VehicleType = 'motorcycle',
): Promise<PastedListingActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: 'auth' };
  const parsed = pastedSchema.safeParse(rawText);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', error: 'paste_more' };
  }
  try {
    const { extracted, evaluation } = await getPastedListingEvaluation(parsed.data, vehicleType);
    return { ok: true, extracted, evaluation };
  } catch (err) {
    // `instanceof` can fail across OpenNext chunk boundaries; also match by name.
    if (
      err instanceof AiUnavailableError ||
      (err instanceof Error && err.name === 'AiUnavailableError')
    ) {
      return { ok: false, reason: 'ai-unavailable', error: 'ai_reader_unavailable' };
    }
    if (
      err instanceof ListingUrlScanError ||
      (err instanceof Error && err.name === 'ListingUrlScanError')
    ) {
      const msg = err instanceof Error ? err.message : '';
      return {
        ok: false,
        reason: 'invalid',
        error:
          msg.includes('Avito') || msg.includes('Biker') ? 'paste_avito_biker' : 'scan_link_failed',
      };
    }
    console.error('evaluatePastedListingAction failed:', err instanceof Error ? err.message : err);
    return { ok: false, reason: 'error', error: 'read_listing_failed' };
  }
}
