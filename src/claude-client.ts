// Thin wrapper around @anthropic-ai/sdk for claude-rpg

import Anthropic from '@anthropic-ai/sdk';

/**
 * F-aaaa105f: single-sourced default model id, consumed by both
 * createClaudeClient (this file) and createAdaptedClient
 * (llm/claude-adapter.ts) so the two factories can no longer drift out of
 * sync with each other the way they previously did (each independently
 * hardcoded this same string). Overridable per-call via
 * ClaudeClientConfig.model. Not yet wired to an env var anywhere in this
 * domain -- ANTHROPIC_MODEL-style override plumbing (read in bin.ts, passed
 * through ClaudeClientConfig.model) is a cross-domain follow-up outside
 * src/claude-client.ts and src/llm/**.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * F-0929ac97: the installed SDK (@anthropic-ai/sdk) defaults to a 600000ms
 * (10-minute) per-request timeout when unset (node_modules/@anthropic-ai/sdk/core.js:134)
 * -- tuned for long-running server workloads, not a turn-based CLI game that
 * should fail fast and let its own retry/error layer take over within
 * seconds. Single-sourced here (like DEFAULT_MODEL above) so both factories
 * fail at the same, deliberately short ceiling instead of each silently
 * inheriting the SDK's server-oriented default.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

export type ClaudeClientConfig = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /**
   * F-0929ac97: per-request timeout in milliseconds, passed straight to the
   * underlying Anthropic client constructor. Defaults to DEFAULT_TIMEOUT_MS
   * (30s) rather than the SDK's own 600000ms (10-minute) default.
   */
  timeout?: number;
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
    validator?: (data: unknown) => void;
  }): Promise<StructuredResult<T>>;

  readonly model: string;
};

/**
 * @deprecated Use {@link createAdaptedClient} from `./llm/claude-adapter.js` instead.
 * This factory lacks streaming support and adapter-layer features.
 */
export function createClaudeClient(config: ClaudeClientConfig = {}): ClaudeClient {
  // F-0929ac97: explicit short timeout (see DEFAULT_TIMEOUT_MS above). This
  // legacy factory has no retry layer of its own (unlike createAdaptedClient),
  // so the SDK's own default internal retry (maxRetries: 2) is deliberately
  // left as-is here -- only the timeout ceiling is overridden.
  const anthropic = new Anthropic({ apiKey: config.apiKey, timeout: config.timeout ?? DEFAULT_TIMEOUT_MS });
  const model = config.model ?? DEFAULT_MODEL;
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
      validator?: (data: unknown) => void;
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
