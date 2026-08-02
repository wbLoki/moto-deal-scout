import { z } from 'zod';

const priceRangeSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().positive(),
  })
  .refine((r) => r.max >= r.min, { message: 'priceRangeMAD.max must be >= min' });

const modelCriteriaSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  priceRangeMAD: priceRangeSchema,
  maxMileageKm: z.number().positive(),
  minYear: z.number().int().gte(1980).lte(2100),
});

/** Shared by the criteria config and the runtime settings form. */
export const searchRangeSchema = z
  .object({
    budgetMin: z.number().int().nonnegative(),
    budgetMax: z.number().int().positive(),
    yearMin: z.number().int().gte(1980).lte(2100),
    yearMax: z.number().int().gte(1980).lte(2100),
  })
  .refine((r) => r.budgetMax >= r.budgetMin, { message: 'budgetMax must be >= budgetMin' })
  .refine((r) => r.yearMax >= r.yearMin, { message: 'yearMax must be >= yearMin' });

const globalCriteriaSchema = z.object({
  preferredCities: z.array(z.string().min(1)).default([]),
  acceptableCities: z.array(z.string().min(1)).default([]),
  minScoreForGoodDeal: z.number().min(0).max(100).default(70),
  maxListingAgeDays: z.number().positive().default(14),
  minModelMatchConfidence: z.number().min(0).max(1).default(0.55),
  minPriceFactor: z.number().min(0).max(1).default(0.5),
  searchRange: searchRangeSchema.optional(),
});

export const searchCriteriaSchema = z.object({
  models: z.array(modelCriteriaSchema).min(1),
  global: globalCriteriaSchema,
});

export type SearchCriteriaInput = z.input<typeof searchCriteriaSchema>;
