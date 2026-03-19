// Fake ClaudeClient for integration testing.
// Returns canned responses so we can test the turn pipeline without network calls.
// Supports injecting failures to test error paths.

import type { ClaudeClient, GenerateResult, StreamCallback, StructuredResult } from '../../src/claude-client.js';
import { NarrationError, type NarrationErrorKind } from '../../src/llm/claude-errors.js';

export type FakeClientOptions = {
  /** Canned narration text returned by generate(). Default: scene description from prompt echo. */
  narration?: string;
  /** If set, generate() throws a NarrationError of this kind. */
  generateFailure?: NarrationErrorKind;
  /** If set, generateStructured() throws a NarrationError of this kind. */
  structuredFailure?: NarrationErrorKind;
  /** Canned structured response data. Default: null (triggers fast-path fallback). */
  structuredData?: unknown;
  /** Track call counts for assertions. */
  callLog?: CallLog;
  /** Enable streaming support. If true, generateStream() is implemented. */
  streaming?: boolean;
  /** If set and streaming=true, generateStream() throws after emitting this many chunks. */
  streamInterruptAfter?: number;
};

export type CallLog = {
  generate: number;
  generateStructured: number;
  generateStream: number;
};

export function createCallLog(): CallLog {
  return { generate: 0, generateStructured: 0, generateStream: 0 };
}

export function createFakeClient(opts: FakeClientOptions = {}): ClaudeClient {
  const log = opts.callLog ?? createCallLog();

  const client: ClaudeClient = {
    model: 'fake-test-model',

    async generate(genOpts): Promise<GenerateResult> {
      log.generate++;

      if (opts.generateFailure) {
        throw new NarrationError({
          kind: opts.generateFailure,
          message: `Fake ${opts.generateFailure} error for testing`,
        });
      }

      const narration = opts.narration ?? `The scene unfolds before you.`;
      return {
        ok: true,
        text: narration,
        inputTokens: 100,
        outputTokens: 50,
      };
    },

    async generateStructured<T>(genOpts: {
      system: string;
      prompt: string;
      maxTokens?: number;
    }): Promise<StructuredResult<T>> {
      log.generateStructured++;

      if (opts.structuredFailure) {
        throw new NarrationError({
          kind: opts.structuredFailure,
          message: `Fake ${opts.structuredFailure} error for testing`,
        });
      }

      if (opts.structuredData) {
        return {
          ok: true,
          data: opts.structuredData as T,
          raw: JSON.stringify(opts.structuredData),
        };
      }

      // Default: return null data (signals caller to use fallback)
      return {
        ok: false,
        data: null,
        raw: '',
        error: 'No structured data configured in fake client',
      };
    },
  };

  // Add generateStream as a direct property if streaming is enabled
  if (opts.streaming) {
    client.generateStream = async (streamOpts: {
      system: string;
      prompt: string;
      maxTokens?: number;
      onChunk: StreamCallback;
    }): Promise<GenerateResult> => {
      log.generateStream++;

      if (opts.generateFailure) {
        throw new NarrationError({
          kind: opts.generateFailure,
          message: `Fake ${opts.generateFailure} error for testing`,
        });
      }

      const narration = opts.narration ?? `The scene unfolds before you.`;
      // Split narration into word-sized chunks
      const words = narration.split(' ');
      let accumulated = '';

      for (let i = 0; i < words.length; i++) {
        // Interrupt mid-stream if configured
        if (opts.streamInterruptAfter !== undefined && i >= opts.streamInterruptAfter) {
          throw new NarrationError({
            kind: 'timeout',
            message: 'Fake stream interrupted for testing',
          });
        }

        const chunk = (i === 0 ? '' : ' ') + words[i];
        accumulated += chunk;
        streamOpts.onChunk(chunk);
      }

      return {
        ok: true,
        text: accumulated,
        inputTokens: 100,
        outputTokens: 50,
      };
    };
  }

  return client;
}
