import { z } from 'zod';
import type { ModelRequest } from './domain/entities/ModelRequest.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlModelRequestRepository } from './infrastructure/persistence/libsql/LibsqlModelRequestRepository.js';

export const modelRequestSchema = z.object({
  brand: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  note: z.string().trim().max(500).optional(),
});

/** Sensible starting criteria for a freshly-approved model; the admin refines them after. */
const APPROVAL_DEFAULTS = {
  priceRangeMAD: { min: 0, max: 300000 },
  maxMileageKm: 60000,
  minYear: 2010,
} as const;

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function submitModelRequest(userId: string, input: unknown): Promise<ModelRequest> {
  const { brand, model, note } = modelRequestSchema.parse(input);
  const db = await openDatabaseFromEnv();
  try {
    return await new LibsqlModelRequestRepository(db).create({ userId, brand, model, note });
  } finally {
    db.close();
  }
}

export async function listUserRequests(userId: string): Promise<ModelRequest[]> {
  const db = await openDatabaseFromEnv();
  try {
    return await new LibsqlModelRequestRepository(db).listByUser(userId);
  } finally {
    db.close();
  }
}

export async function listPendingRequests(): Promise<ModelRequest[]> {
  const db = await openDatabaseFromEnv();
  try {
    return await new LibsqlModelRequestRepository(db).listPending();
  } finally {
    db.close();
  }
}

/**
 * Approves a request: creates an enabled model (with default criteria the
 * admin can refine) and marks the request approved. No-op if not pending.
 */
export async function approveModelRequest(requestId: string, adminId: string): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    const requests = new LibsqlModelRequestRepository(db);
    const request = await requests.findById(requestId);
    if (!request || request.status !== 'pending') return;

    await new LibsqlModelRepository(db).upsert({
      id: slugify(`${request.brand}-${request.model}`),
      brand: request.brand,
      model: request.model,
      aliases: [],
      priceRangeMAD: { ...APPROVAL_DEFAULTS.priceRangeMAD },
      maxMileageKm: APPROVAL_DEFAULTS.maxMileageKm,
      minYear: APPROVAL_DEFAULTS.minYear,
      enabled: true,
      autoCalibrate: true,
    });
    await requests.setStatus(requestId, 'approved', adminId);
  } finally {
    db.close();
  }
}

export async function rejectModelRequest(requestId: string, adminId: string): Promise<void> {
  const db = await openDatabaseFromEnv();
  try {
    await new LibsqlModelRequestRepository(db).setStatus(requestId, 'rejected', adminId);
  } finally {
    db.close();
  }
}
