// Thin wrapper around @anthropic-ai/sdk for claude-rpg

import Anthropic from '@anthropic-ai/sdk';

export type ClaudeClientConfig = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
};

export type GenerateResult = {
  ok: boolean;
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export type StructuredResult<T> = {
  ok: boolean;
  data: T | null;
  raw: string;
  error?: string;
};

export type ClaudeClient = {
  generate(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<GenerateResult>;

  generateStructured<T>(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<StructuredResult<T>>;

  readonly model: string;
};

export function createClaudeClient(config: ClaudeClientConfig = {}): ClaudeClient {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const model = config.model ?? 'claude-sonnet-4-20250514';
  const defaultMaxTokens = config.maxTokens ?? 1024;

  return {
    model,

    async generate(opts) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: opts.maxTokens ?? defaultMaxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      return {
        ok: response.stop_reason === 'end_turn',
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },

    async generateStructured<T>(opts: {
      system: string;
      prompt: string;
      maxTokens?: number;
    }): Promise<StructuredResult<T>> {
      const response = await anthropic.messages.create({
        model,
        max_tokens: opts.maxTokens ?? defaultMaxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Extract JSON from response (may be wrapped in ```json blocks)
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        return { ok: false, data: null, raw: text, error: 'No JSON found in response' };
      }

      try {
        const data = JSON.parse(jsonMatch[1]) as T;
        return { ok: true, data, raw: text };
      } catch (e) {
        return { ok: false, data: null, raw: text, error: `JSON parse error: ${e}` };
      }
    },
  };
}
