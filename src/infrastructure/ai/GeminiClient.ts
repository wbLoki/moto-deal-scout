import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { AiError, type AiExtractor, type ExtractArgs, type JsonObjectSchema } from './AnthropicClient.js';

/** The subset of JSON Schema our feature tools use, before conversion to Gemini's shape. */
interface RawSchema {
  readonly type: string | readonly string[];
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly properties?: Record<string, RawSchema>;
  readonly required?: readonly string[];
  readonly items?: RawSchema;
}

const TYPE_MAP: Record<string, Type> = {
  object: Type.OBJECT,
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
};

/**
 * Converts our tool `input_schema` (plain JSON Schema, as the Anthropic path
 * uses) into Gemini's OpenAPI-subset `responseSchema`. The one real difference:
 * we express nullable fields as `type: ['x', 'null']`, which Gemini spells as
 * `type: 'x', nullable: true`. Enums must also carry `format: 'enum'`.
 */
export function toGeminiSchema(node: RawSchema): Schema {
  // `typeof` (not Array.isArray) keeps this typed as string[] rather than any[].
  const types: readonly string[] = typeof node.type === 'string' ? [node.type] : node.type;
  const nullable = types.includes('null');
  const baseType = types.find((t) => t !== 'null') ?? 'string';

  const out: Schema = { type: TYPE_MAP[baseType] ?? Type.STRING };
  if (nullable) out.nullable = true;
  if (node.description) out.description = node.description;
  if (node.enum) {
    out.enum = node.enum.map(String);
    out.format = 'enum';
  }
  if (node.properties) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  if (node.required) out.required = [...node.required];
  if (node.items) out.items = toGeminiSchema(node.items);
  return out;
}

/**
 * Google Gemini implementation of {@link AiExtractor}. Gets structured output
 * via JSON mode + a `responseSchema` (rather than the forced-tool call the
 * Anthropic client uses), then validates with the same zod schema — so the
 * features can't tell which provider answered. Thinking is disabled: these are
 * extraction tasks, and thinking tokens would eat the output budget.
 */
export class GeminiClient implements AiExtractor {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async extract<T>(args: ExtractArgs<T>): Promise<T> {
    let text: string | undefined;
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: args.user,
        config: {
          systemInstruction: args.system,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(args.jsonSchema as unknown as JsonObjectSchema & RawSchema),
          maxOutputTokens: args.maxTokens ?? 1024,
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      text = res.text;
    } catch (err) {
      throw new AiError(`Gemini request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!text) throw new AiError('Gemini returned an empty response.');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError('Gemini did not return valid JSON.');
    }
    const parsed = args.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiError(`Gemini returned an unexpected shape: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}
