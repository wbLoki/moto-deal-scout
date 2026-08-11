import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { loadEnv } from '../../config/env.js';

/** Thrown when the AI features are called without an API key configured. */
export class AiUnavailableError extends Error {
  constructor(message = 'AI is not configured (ANTHROPIC_API_KEY is unset).') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** Thrown when a Claude request fails or returns an unexpected shape. */
export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiError';
  }
}

/** A minimal JSON Schema object for a tool's input (all our tools take an object). */
export interface JsonObjectSchema {
  readonly type: 'object';
  readonly properties: Record<string, unknown>;
  readonly required?: readonly string[];
}

export interface ExtractArgs<T> {
  readonly system: string;
  readonly user: string;
  /** The single tool Claude is forced to call; its input is our structured result. */
  readonly toolName: string;
  readonly toolDescription: string;
  readonly jsonSchema: JsonObjectSchema;
  /** Validates Claude's tool input; a mismatch becomes an {@link AiError}. */
  readonly schema: z.ZodType<T>;
  readonly maxTokens?: number;
}

/**
 * Provider-agnostic structured-output boundary. Application services depend on
 * this, so they can be unit-tested with a fake that returns canned data — no
 * network, no API key. The real implementation is {@link AnthropicClient}.
 */
export interface AiExtractor {
  extract<T>(args: ExtractArgs<T>): Promise<T>;
}

/**
 * Claude-backed {@link AiExtractor}. Gets structured output by forcing a single
 * tool call whose `input_schema` is the shape we want, then validating the
 * returned tool input with the paired zod schema — the robust way to get typed
 * JSON out of the model.
 */
export class AnthropicClient implements AiExtractor {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /** Builds a client from env, or throws {@link AiUnavailableError} if no key is set. */
  static fromEnv(): AnthropicClient {
    const env = loadEnv();
    if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError();
    return new AnthropicClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }

  async extract<T>(args: ExtractArgs<T>): Promise<T> {
    let message: Anthropic.Messages.Message;
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: args.maxTokens ?? 1024,
        system: args.system,
        messages: [{ role: 'user', content: args.user }],
        tools: [
          {
            name: args.toolName,
            description: args.toolDescription,
            input_schema: args.jsonSchema as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: args.toolName },
      });
    } catch (err) {
      throw new AiError(`Claude request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const block = message.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new AiError('Claude did not return the expected structured response.');
    }
    const parsed = args.schema.safeParse(block.input);
    if (!parsed.success) {
      throw new AiError(`Claude returned an unexpected shape: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}
