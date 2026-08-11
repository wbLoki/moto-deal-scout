import { loadCriteria } from './config/loadCriteria.js';
import { loadEnv } from './config/env.js';
import { estimateAndEvaluate } from './application/services/aiPriceEstimator.js';
import { parseListing } from './application/services/aiListingParser.js';
import { evaluateBike, type BikeEvaluation, type BikeInput } from './application/services/evaluateBike.js';
import { createAiExtractor } from './infrastructure/ai/aiExtractor.js';
import { openDatabase, resolveDatabaseConfig } from './infrastructure/persistence/libsql/Database.js';
import { LibsqlModelRepository } from './infrastructure/persistence/libsql/LibsqlModelRepository.js';

export type { BikeEvaluation, BikeInput } from './application/services/evaluateBike.js';

/**
 * Server entry for the public compare page: loads the enabled models and the
 * global scoring config, then delegates to the pure {@link evaluateBike}. Opens
 * and closes the database per request, mirroring the read-model helpers.
 */
export async function getBikeEvaluation(input: BikeInput): Promise<BikeEvaluation> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const db = await openDatabase(resolveDatabaseConfig(env));
  try {
    const models = await new LibsqlModelRepository(db).listEnabledCriteria();
    return evaluateBike(input, { models, global: config.global });
  } finally {
    db.close();
  }
}

/**
 * AI fallback for a bike we don't have market data on: Claude estimates a fair
 * range and we score against it. No database needed — only the global scoring
 * config. Throws `AiUnavailableError` when no API key is set (caller maps it to
 * a friendly state).
 */
export async function getAiEstimate(input: BikeInput): Promise<BikeEvaluation> {
  const env = loadEnv();
  const config = await loadCriteria(env.CRITERIA_CONFIG_PATH);
  const ai = createAiExtractor();
  return estimateAndEvaluate(ai, input, config.global);
}

/** The fields Claude pulled from an ad, plus how our engine rates them. */
export interface PastedListingResult {
  readonly extracted: BikeInput;
  readonly evaluation: BikeEvaluation;
}

/**
 * Parses a pasted ad with Claude into structured fields, then rates it with the
 * deterministic engine (data-first). Throws `AiUnavailableError` without a key.
 */
export async function getPastedListingEvaluation(text: string): Promise<PastedListingResult> {
  const ai = createAiExtractor();
  const extracted = await parseListing(ai, text);
  const evaluation = await getBikeEvaluation(extracted);
  return { extracted, evaluation };
}
