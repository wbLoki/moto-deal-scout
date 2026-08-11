import { z } from 'zod';
import type { AiExtractor, JsonObjectSchema } from '../../infrastructure/ai/AnthropicClient.js';
import type { BikeInput } from './evaluateBike.js';

const parsedSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().nullable(),
  mileageKm: z.number().nullable(),
  priceMAD: z.number().nullable(),
  city: z.string().nullable(),
});

const JSON_SCHEMA: JsonObjectSchema = {
  type: 'object',
  properties: {
    brand: { type: 'string', description: "Maker, normalized Latin spelling e.g. 'Yamaha', 'Honda'." },
    model: { type: 'string', description: "Model, normalized e.g. 'MT-07', 'CBR500R'." },
    year: { type: ['integer', 'null'], description: 'Model year, or null if not stated.' },
    mileageKm: { type: ['integer', 'null'], description: 'Mileage in km, or null if not stated.' },
    priceMAD: { type: ['integer', 'null'], description: 'Asking price in MAD, or null if not stated.' },
    city: { type: ['string', 'null'], description: 'City, or null if not stated.' },
  },
  required: ['brand', 'model', 'year', 'mileageKm', 'priceMAD', 'city'],
};

const SYSTEM = [
  'You extract structured fields from a Moroccan motorcycle classified ad.',
  'The text may be in French, Arabic, or Moroccan darija.',
  "Return the brand and model normalized to their common Latin spelling (e.g. 'Yamaha', 'MT-07').",
  'Give the model year, mileage in km, asking price in MAD, and city.',
  'Use null for anything not clearly stated — never guess a price that is not given, and convert mileage in other units to km.',
].join(' ');

/**
 * Extracts a {@link BikeInput} from free-text ad content with Claude. Nullable
 * fields become omitted (undefined) so the downstream engine treats them as
 * "not provided" rather than zero. Numbers are rounded to integers.
 */
export async function parseListing(ai: AiExtractor, text: string): Promise<BikeInput> {
  const raw = await ai.extract({
    system: SYSTEM,
    user: text,
    toolName: 'report_listing_fields',
    toolDescription: 'Report the structured fields extracted from this motorcycle ad.',
    jsonSchema: JSON_SCHEMA,
    schema: parsedSchema,
    maxTokens: 400,
  });
  return {
    brand: raw.brand.trim(),
    model: raw.model.trim(),
    ...(raw.year != null ? { year: Math.round(raw.year) } : {}),
    ...(raw.mileageKm != null ? { mileageKm: Math.round(raw.mileageKm) } : {}),
    ...(raw.priceMAD != null ? { priceMAD: Math.round(raw.priceMAD) } : {}),
    ...(raw.city && raw.city.trim() ? { city: raw.city.trim() } : {}),
  };
}
