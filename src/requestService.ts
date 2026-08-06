import { z } from 'zod';
import { catalogContains, suggestAliases } from './catalog/motorcycleCatalog.js';
import type { ModelRequest } from './domain/entities/ModelRequest.js';
import { modelId, provisionalModel } from './domain/services/provisionalModel.js';
import { openDatabaseFromEnv } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';
import { LibsqlModelRequestRepository } from './infrastructure/persistence/libsql/LibsqlModelRequestRepository.js';

export const modelRequestSchema = z.object({
  brand: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  note: z.string().trim().max(500).optional(),
});

export type SubmitRequestResult =
  | { readonly status: 'created'; readonly request: ModelRequest }
  | { readonly status: 'duplicate'; readonly message: string };

/**
 * Files a request for a model we don't track yet.
 *
 * Checks first whether the model already exists, or is in the reference
 * catalog and so will be picked up by the next weekly crawl on its own —
 * either way there's nothing for an admin to approve, and telling the user
 * that is more useful than silently queueing a no-op.
 */
export async function submitModelRequest(
  userId: string,
  input: unknown,
): Promise<SubmitRequestResult> {
  const { brand, model, note } = modelRequestSchema.parse(input);
  const db = await openDatabaseFromEnv();
  try {
    const key = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const wantedId = modelId(brand, model);
    const existing = await new LibsqlModelRepository(db).listAll();

    const tracked = existing.find(
      (m) => m.id === wantedId || (key(m.brand) === key(brand) && key(m.model) === key(model)),
    );
    if (tracked) {
      return {
        status: 'duplicate',
        message: `${tracked.brand} ${tracked.model} is already tracked — you can follow it from your profile.`,
      };
    }

    if (catalogContains(brand, model)) {
      return {
        status: 'duplicate',
        message: `${brand.trim()} ${model.trim()} is already in our catalog — it will appear automatically once one comes up for sale.`,
      };
    }

    const request = await new LibsqlModelRequestRepository(db).create({
      userId,
      brand,
      model,
      note,
    });
    return { status: 'created', request };
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

    await new LibsqlModelRepository(db).upsert(
      provisionalModel({
        id: modelId(request.brand, request.model),
        brand: request.brand,
        model: request.model,
        aliases: suggestAliases(request.model),
      }),
    );
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
