import { z } from 'zod';
import type { ModelCriteria } from '../../domain/entities/SearchCriteria.js';
import type { AiExtractor, JsonObjectSchema } from '../../infrastructure/ai/AnthropicClient.js';

const reviewSchema = z.object({
  verdict: z.enum(['plausible', 'too-low', 'too-high', 'unsure']),
  suggestedMinMAD: z.number().nullable(),
  suggestedMaxMAD: z.number().nullable(),
  note: z.string().min(1),
});

export interface RangeReview {
  readonly verdict: 'plausible' | 'too-low' | 'too-high' | 'unsure';
  readonly suggestedMinMAD?: number;
  readonly suggestedMaxMAD?: number;
  readonly note: string;
}

const JSON_SCHEMA: JsonObjectSchema = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['plausible', 'too-low', 'too-high', 'unsure'],
      description: "Whether OUR range looks right, or is too low/high, or you can't tell.",
    },
    suggestedMinMAD: { type: ['integer', 'null'], description: 'A corrected min in MAD, or null.' },
    suggestedMaxMAD: { type: ['integer', 'null'], description: 'A corrected max in MAD, or null.' },
    note: { type: 'string', description: 'One short sentence explaining the verdict.' },
  },
  required: ['verdict', 'suggestedMinMAD', 'suggestedMaxMAD', 'note'],
};

const SYSTEM = [
  'You review calibrated fair-price ranges for used motorcycles in the Moroccan market (MAD).',
  'Given a model and OUR fair range, judge whether it is plausible for the Moroccan used market',
  '(imports, taxes and local demand make prices differ from Europe).',
  "Return 'plausible' if reasonable, 'too-low' or 'too-high' if our range is clearly off, or 'unsure' if you can't tell.",
  'When off, suggest a corrected min/max in MAD; otherwise use null. Keep the note to one short sentence.',
].join(' ');

/** Asks Claude whether one model's calibrated fair range looks plausible. */
export async function reviewRange(ai: AiExtractor, model: ModelCriteria): Promise<RangeReview> {
  const raw = await ai.extract({
    system: SYSTEM,
    user: `Model: ${model.brand} ${model.model}\nOur fair range: ${model.priceRangeMAD.min}–${model.priceRangeMAD.max} MAD`,
    toolName: 'report_range_review',
    toolDescription: 'Report whether our fair range for this model is plausible.',
    jsonSchema: JSON_SCHEMA,
    schema: reviewSchema,
    maxTokens: 300,
  });
  return {
    verdict: raw.verdict,
    note: raw.note,
    ...(raw.suggestedMinMAD != null ? { suggestedMinMAD: Math.round(raw.suggestedMinMAD) } : {}),
    ...(raw.suggestedMaxMAD != null ? { suggestedMaxMAD: Math.round(raw.suggestedMaxMAD) } : {}),
  };
}
