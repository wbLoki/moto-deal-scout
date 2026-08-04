import { z } from 'zod';
import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import type { StoredModel } from './domain/entities/Model.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const modelFormSchema = z
  .object({
    id: z.string().min(1).optional(),
    brand: z.string().trim().min(1),
    model: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(1)).default([]),
    priceMin: z.number().int().nonnegative(),
    priceMax: z.number().int().positive(),
    maxMileageKm: z.number().int().positive(),
    minYear: z.number().int().gte(1980).lte(2100),
    enabled: z.boolean().default(true),
    autoCalibrate: z.boolean().default(true),
  })
  .refine((m) => m.priceMax >= m.priceMin, { message: 'Max price must be >= min price' });

export type ModelFormInput = z.infer<typeof modelFormSchema>;

function toStoredModel(input: ModelFormInput): StoredModel {
  return {
    id: input.id ?? slugify(`${input.brand}-${input.model}`),
    brand: input.brand,
    model: input.model,
    aliases: input.aliases,
    priceRangeMAD: { min: input.priceMin, max: input.priceMax },
    maxMileageKm: input.maxMileageKm,
    minYear: input.minYear,
    enabled: input.enabled,
    autoCalibrate: input.autoCalibrate,
  };
}

export async function listAllModels(): Promise<StoredModel[]> {
  const db = await openDatabaseFromEnv();
  try {
    const repo = new LibsqlModelRepository(db);
    // Seed from the config file the first time, so the admin always sees the
    // starter models even before the first scan or dashboard load.
    const config = await loadCriteria(loadEnv().CRITERIA_CONFIG_PATH);
    await repo.seedIfEmpty(config.models);
    return await repo.listAll();
  } finally {
    db.close();
  }
}

/** Validates and inserts/updates a model. Returns the stored id. */
export async function saveModel(input: unknown): Promise<string> {
  const parsed = modelFormSchema.parse(input);
  const model = toStoredModel(parsed);
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlModelRepository(db).upsert(model);
    return model.id;
  } finally {
    db.close();
  }
}

export async function setModelEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlModelRepository(db).setEnabled(id, enabled);
  } finally {
    db.close();
  }
}

export async function removeModel(id: string): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlModelRepository(db).delete(id);
  } finally {
    db.close();
  }
}
