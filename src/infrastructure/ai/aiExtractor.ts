import { loadEnv } from '../../config/env.js';
import { AiUnavailableError, AnthropicClient, type AiExtractor } from './AnthropicClient.js';
import { GeminiClient } from './GeminiClient.js';

/**
 * Builds the configured AI provider's {@link AiExtractor}. Reads `AI_PROVIDER`
 * (default `gemini`) and throws {@link AiUnavailableError} when that provider's
 * key is missing — callers map it to a friendly "AI not configured" state. This
 * is the one place the features touch a concrete provider, so switching between
 * Gemini and Claude is an env flag, not a code change.
 */
export function createAiExtractor(): AiExtractor {
  const env = loadEnv();
  if (env.AI_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new AiUnavailableError('AI is not configured (ANTHROPIC_API_KEY is unset).');
    }
    return new AnthropicClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }
  if (!env.GEMINI_API_KEY) {
    throw new AiUnavailableError('AI is not configured (GEMINI_API_KEY is unset).');
  }
  return new GeminiClient(env.GEMINI_API_KEY, env.GEMINI_MODEL);
}
