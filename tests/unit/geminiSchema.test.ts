import { Type } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { toGeminiSchema } from '../../src/infrastructure/ai/GeminiClient.js';

describe('toGeminiSchema', () => {
  it('converts a nullable JSON-Schema field (["integer","null"]) to nullable:true', () => {
    const out = toGeminiSchema({
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model.' },
        year: { type: ['integer', 'null'], description: 'Year or null.' },
      },
      required: ['model', 'year'],
    });

    expect(out.type).toBe(Type.OBJECT);
    expect(out.required).toEqual(['model', 'year']);
    expect(out.properties?.['model']).toEqual({ type: Type.STRING, description: 'Model.' });
    expect(out.properties?.['year']).toEqual({
      type: Type.INTEGER,
      nullable: true,
      description: 'Year or null.',
    });
  });

  it('marks enum fields with format:enum', () => {
    const out = toGeminiSchema({
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['plausible', 'too-low', 'too-high', 'unsure'] },
      },
      required: ['verdict'],
    });
    expect(out.properties?.['verdict']).toEqual({
      type: Type.STRING,
      enum: ['plausible', 'too-low', 'too-high', 'unsure'],
      format: 'enum',
    });
  });
});
