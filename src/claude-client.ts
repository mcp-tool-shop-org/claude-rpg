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

export type StreamCallback = (chunk: string) => void;

export type ClaudeClient = {
  generate(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<GenerateResult>;

  /** Optional streaming variant. Returns same GenerateResult with full accumulated text. */
  generateStream?(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
    onChunk: StreamCallback;
  }): Promise<GenerateResult>;

  /**
   * Parse structured JSON from an LLM response.
   *
   * **Limitation:** The parsed result is cast to `T` without runtime validation.
   * Callers should either constrain prompts tightly or validate the returned `data`
   * themselves. An optional `validator` callback can be provided to reject bad shapes
   * early — if it throws, the result is returned with `ok: false` and the error message.
   */
  generateStructured<T>(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
    validator?: (data: unknown) => asserts data is T;
  }): Promise<StructuredResult<T>>;

  readonly model: string;
};

/**
 * @deprecated Use {@link createAdaptedClient} from `./llm/claude-adapter.js` instead.
 * This factory lacks streaming support and adapter-layer features.
 */
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
      validator?: (data: unknown) => asserts data is T;
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

      // Extract JSON from response — try full text first, then fenced block, then greedy regex
      let parsed: T | undefined;

      // 1. Try parsing full text as JSON directly
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        // not raw JSON, try fenced block
      }

      // 2. Try fenced ```json block (non-greedy)
      if (parsed === undefined) {
        const fencedMatch = text.match(/```json\s*([\s\S]*?)```/);
        if (fencedMatch) {
          try {
            parsed = JSON.parse(fencedMatch[1]) as T;
          } catch {
            // fenced block wasn't valid JSON
          }
        }
      }

      // 3. Fallback: greedy regex for outermost { ... }
      if (parsed === undefined) {
        const greedyMatch = text.match(/(\{[\s\S]*\})/);
        if (greedyMatch) {
          try {
            parsed = JSON.parse(greedyMatch[1]) as T;
          } catch {
            // greedy match wasn't valid JSON either
          }
        }
      }

      if (parsed === undefined) {
        return { ok: false, data: null, raw: text, error: 'No JSON found in response' };
      }

      // PFE-003: If a validator is provided, use it to reject bad shapes early.
      if (opts.validator) {
        try {
          opts.validator(parsed);
        } catch (validationErr) {
          const msg = validationErr instanceof Error ? validationErr.message : 'Validation failed';
          return { ok: false, data: null, raw: text, error: msg };
        }
      }

      return { ok: true, data: parsed, raw: text };
    },
  };
}
