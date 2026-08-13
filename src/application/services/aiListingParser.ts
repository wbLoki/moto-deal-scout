import { z } from 'zod';
import type { AiExtractor, JsonObjectSchema } from '../../infrastructure/ai/AnthropicClient.js';
import type { BikeInput } from './evaluateBike.js';
import type { VehicleType } from '../../domain/entities/VehicleType.js';

const parsedSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().nullable(),
  mileageKm: z.number().nullable(),
  displacementCc: z.number().nullable(),
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
    displacementCc: {
      type: ['integer', 'null'],
      description: 'Engine displacement in cc (e.g. 500, 689), or null if not stated.',
    },
    priceMAD: { type: ['integer', 'null'], description: 'Asking price in MAD, or null if not stated.' },
    city: { type: ['string', 'null'], description: 'City, or null if not stated.' },
  },
  required: ['brand', 'model', 'year', 'mileageKm', 'displacementCc', 'priceMAD', 'city'],
};

const SYSTEM_MOTO = [
  'You extract structured fields from a Moroccan motorcycle classified ad.',
  'The text may be in French, Arabic, or Moroccan darija.',
  "Return the brand and model normalized to their common Latin spelling (e.g. 'Yamaha', 'MT-07').",
  'Give the model year, mileage in km, engine displacement in cc, asking price in MAD, and city.',
  'Asking price may appear as DH, MAD, Dhs, د.م., or “prix”; always extract it when present — never leave priceMAD null if a clear number is in the text.',
  'Use null for anything not clearly stated — never guess a price that is not given, and convert mileage in other units to km.',
].join(' ');

const SYSTEM_CAR = [
  'You extract structured fields from a Moroccan used-car classified ad.',
  'The text may be in French, Arabic, or Moroccan darija.',
  "Return the brand and model normalized to their common Latin spelling (e.g. 'Dacia', 'Duster', 'Renault', 'Clio').",
  'Give the model year, mileage in km, asking price in MAD, and city. Do NOT invent motorcycle engine displacement (cc) for a car — leave displacementCc null.',
  'Asking price may appear as DH, MAD, Dhs, د.م., or “prix”; always extract it when present — never leave priceMAD null if a clear number is in the text.',
  'Use null for anything not clearly stated — never guess a price that is not given, and convert mileage in other units to km.',
].join(' ');

/**
 * Extracts a {@link BikeInput} from free-text ad content with Claude. Nullable
 * fields become omitted (undefined) so the downstream engine treats them as
 * "not provided" rather than zero. Numbers are rounded to integers.
 */
export async function parseListing(
  ai: AiExtractor,
  text: string,
  vehicleType: VehicleType = 'motorcycle',
): Promise<BikeInput> {
  const isCar = vehicleType === 'car';
  const raw = await ai.extract({
    system: isCar ? SYSTEM_CAR : SYSTEM_MOTO,
    user: text,
    toolName: 'report_listing_fields',
    toolDescription: isCar
      ? 'Report the structured fields extracted from this car ad.'
      : 'Report the structured fields extracted from this motorcycle ad.',
    jsonSchema: JSON_SCHEMA,
    schema: parsedSchema,
    maxTokens: 400,
  });
  return {
    brand: raw.brand.trim(),
    model: raw.model.trim(),
    ...(raw.year != null ? { year: Math.round(raw.year) } : {}),
    ...(raw.mileageKm != null ? { mileageKm: Math.round(raw.mileageKm) } : {}),
    ...(!isCar && raw.displacementCc != null
      ? { displacementCc: Math.round(raw.displacementCc) }
      : {}),
    ...(raw.priceMAD != null ? { priceMAD: Math.round(raw.priceMAD) } : {}),
    ...(raw.city && raw.city.trim() ? { city: raw.city.trim() } : {}),
    vehicleType,
  };
}
