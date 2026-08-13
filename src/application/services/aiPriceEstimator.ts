import { z } from 'zod';
import type { GlobalCriteria, ModelCriteria } from '../../domain/entities/SearchCriteria.js';
import type { AiExtractor, JsonObjectSchema } from '../../infrastructure/ai/AnthropicClient.js';
import { scoreAgainstModel, type BikeEvaluation, type BikeInput } from './evaluateBike.js';

const estimateSchema = z.object({
  fairMinMAD: z.number().positive(),
  fairMaxMAD: z.number().positive(),
  typicalMaxMileageKm: z.number().positive(),
  typicalMinYear: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
  rationale: z.string().min(1),
});

export type AiRangeEstimate = z.infer<typeof estimateSchema>;

const JSON_SCHEMA: JsonObjectSchema = {
  type: 'object',
  properties: {
    fairMinMAD: { type: 'integer', description: 'Lower bound of the fair private-sale price in MAD.' },
    fairMaxMAD: { type: 'integer', description: 'Upper bound of the fair private-sale price in MAD.' },
    typicalMaxMileageKm: {
      type: 'integer',
      description: 'Mileage (km) beyond which this model is considered high-mileage.',
    },
    typicalMinYear: {
      type: 'integer',
      description: 'Model year below which this bike is considered old/undesirable.',
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    rationale: { type: 'string', description: 'One or two sentences explaining the estimate.' },
  },
  required: ['fairMinMAD', 'fairMaxMAD', 'typicalMaxMileageKm', 'typicalMinYear', 'confidence', 'rationale'],
};

function systemPrompt(vehicleType: BikeInput['vehicleType']): string {
  const kind = vehicleType === 'car' ? 'used-car' : 'used-motorcycle';
  const noun = vehicleType === 'car' ? 'car' : 'bike';
  return [
    `You are a ${kind} pricing expert for the Moroccan market.`,
    `Report a fair private-sale price range in Moroccan dirham (MAD) for the given ${noun}.`,
    "Our own market-calibrated data is the source of truth and is used whenever we have it; you are consulted ONLY for models we lack data on.",
    'Base the range on realistic Moroccan resale values (imports, taxes and local demand make these differ from Europe). Be slightly conservative and, if unsure, widen the range and lower your confidence.',
    'Adjust for the specific year and mileage when provided. Also give a typical high-mileage threshold and a typical minimum desirable model year for this model.',
  ].join(' ');
}

function userPrompt(input: BikeInput): string {
  const lines = [`Brand: ${input.brand}`, `Model: ${input.model}`];
  if (input.year !== undefined) lines.push(`Year: ${input.year}`);
  if (input.mileageKm !== undefined) lines.push(`Mileage: ${input.mileageKm} km`);
  if (input.city) lines.push(`City: ${input.city}`);
  return lines.join('\n');
}

/**
 * Asks Claude for a fair price range for a bike we have no market data on.
 * Normalizes the result (rounds to integers, orders min ≤ max) but does not
 * score anything — see {@link estimateAndEvaluate}.
 */
export async function estimateFairRange(ai: AiExtractor, input: BikeInput): Promise<AiRangeEstimate> {
  const raw = await ai.extract({
    system: systemPrompt(input.vehicleType),
    user: userPrompt(input),
    toolName: 'report_fair_price',
    toolDescription:
      input.vehicleType === 'car'
        ? 'Report the fair used price range and typical specs for this car.'
        : 'Report the fair used price range and typical specs for this motorcycle.',
    jsonSchema: JSON_SCHEMA,
    schema: estimateSchema,
    maxTokens: 600,
  });
  const min = Math.round(Math.min(raw.fairMinMAD, raw.fairMaxMAD));
  const max = Math.round(Math.max(raw.fairMinMAD, raw.fairMaxMAD));
  return {
    ...raw,
    fairMinMAD: min,
    fairMaxMAD: max,
    typicalMaxMileageKm: Math.round(raw.typicalMaxMileageKm),
    typicalMinYear: Math.round(raw.typicalMinYear),
  };
}

/**
 * Estimates a fair range with Claude, then runs the SAME scorer/tier/advisor as
 * the tracked-model path against a synthetic model built from that range. The
 * result is flagged `ai-estimated` with Claude's confidence and rationale so the
 * UI can badge it as an estimate rather than market-derived truth.
 */
export async function estimateAndEvaluate(
  ai: AiExtractor,
  input: BikeInput,
  global: GlobalCriteria,
): Promise<BikeEvaluation> {
  const est = await estimateFairRange(ai, input);
  const model: ModelCriteria = {
    id: 'ai-estimate',
    brand: input.brand,
    model: input.model,
    aliases: [],
    priceRangeMAD: { min: est.fairMinMAD, max: est.fairMaxMAD },
    maxMileageKm: est.typicalMaxMileageKm,
    minYear: est.typicalMinYear,
    vehicleType: input.vehicleType ?? 'motorcycle',
  };
  const { rating, suggestion } = scoreAgainstModel(input, model, global);
  return {
    status: 'ai-estimated',
    matched: { brand: input.brand, model: input.model, confidence: 1 },
    ...(rating ? { rating } : {}),
    suggestion,
    ai: { confidence: est.confidence, rationale: est.rationale },
  };
}
