import type { Client } from '@libsql/client';
import { defaultCarModels } from '../../../config/defaultCarCriteria.js';
import type { ModelCriteria } from '../../../domain/entities/SearchCriteria.js';
import { LibsqlModelRepository } from './LibsqlModelRepository.js';

/** Process-level guard so hot paths don't re-COUNT models on every request. */
let seededThisProcess = false;

/**
 * Seeds the models table from config when empty. After the first successful
 * call in this process, subsequent calls are no-ops (models already exist or
 * were just seeded).
 */
export async function seedModelsOnce(
  db: Client,
  models: readonly ModelCriteria[],
): Promise<void> {
  if (seededThisProcess) return;
  const repo = new LibsqlModelRepository(db);
  await repo.seedIfEmptyForType(models, 'motorcycle');
  await repo.seedIfEmptyForType(defaultCarModels, 'car');
  seededThisProcess = true;
}
