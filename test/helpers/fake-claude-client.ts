// Fake ClaudeClient for integration testing.
// Returns canned responses so we can test the turn pipeline without network calls.
// Supports injecting failures to test error paths.

import type { ClaudeClient, GenerateResult, StreamCallback, StructuredResult } from '../../src/claude-client.js';
import { NarrationError, type NarrationErrorKind } from '../../src/llm/claude-errors.js';

export type FakeClientOptions = {
  /**
   * Canned narration text returned by generate(). Default: scene description
   * from prompt echo. A fixed string returns the same text for the client's
   * whole lifetime (original behavior). A function is call-count-aware: it
   * receives the 1-indexed call number for THIS client's generate() calls
   * (log.generate, post-increment, matching generateFailure's own
   * convention below) and returns the text that call should resolve with --
   * e.g. `(n) => (n === 1 ? 'first exchange' : 'second exchange')` scripts
   * two distinguishable turns so a test can assert which one's text reached
   * a later prompt (F-a6575a94: conversation-memory round trip needs
   * exchange 1 and exchange 2 to carry different text to prove the window
   * boundary keeps only the most recent exchanges, which a single fixed
   * narration string can't distinguish). generateStream() shares this
   * option and scripts off its own independent call number
   * (log.generateStream), mirroring generateFailure's split.
   */
  narration?: string | ((callNumber: number) => string);
  /**
   * If set, generate() throws a NarrationError of this kind. A fixed kind
   * fails every call identically (original behavior). A function is
   * call-count-aware: it receives the 1-indexed call number for THIS
   * client's generate() calls (log.generate, post-increment) and returns
   * the kind that call should fail with, or undefined to let it succeed --
   * e.g. `(n) => (n === 2 ? 'timeout' : undefined)` scripts "only the
   * second generate() call fails," so a test can express a transient
   * mid-session outage that clears rather than every call degrading
   * identically (F-bf400714). generateStream() shares this option and
   * scripts off its own independent call number (log.generateStream).
   */
  generateFailure?: NarrationErrorKind | ((callNumber: number) => NarrationErrorKind | undefined);
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
  /**
   * F-95191273: the `prompt` string from the most recent generate()/
   * generateStream() call, if any. Lets a test prove restored session
   * state (e.g. resumeHarness()'d rumors/pressures/party) actually reached
   * the next turn's LLM prompt, not just that it round-tripped through
   * in-memory field assignment.
   */
  lastGeneratePrompt?: string;
};

export function createCallLog(): CallLog {
  return { generate: 0, generateStructured: 0, generateStream: 0 };
}

/** Resolves a (possibly call-count-scripted) generateFailure option to the kind that should fail THIS call, if any. */
function resolveGenerateFailure(
  failure: FakeClientOptions['generateFailure'],
  callNumber: number,
): NarrationErrorKind | undefined {
  if (failure === undefined) return undefined;
  return typeof failure === 'function' ? failure(callNumber) : failure;
}

/** Resolves a (possibly call-count-scripted) narration option to this call's text. */
function resolveNarration(
  narration: FakeClientOptions['narration'],
  callNumber: number,
): string {
  if (narration === undefined) return 'The scene unfolds before you.';
  return typeof narration === 'function' ? narration(callNumber) : narration;
}

export function createFakeClient(opts: FakeClientOptions = {}): ClaudeClient {
  const log = opts.callLog ?? createCallLog();

  const client: ClaudeClient = {
    model: 'fake-test-model',

    async generate(genOpts): Promise<GenerateResult> {
      log.generate++;
      log.lastGeneratePrompt = genOpts.prompt;

      const failure = resolveGenerateFailure(opts.generateFailure, log.generate);
      if (failure) {
        throw new NarrationError({
          kind: failure,
          message: `Fake ${failure} error for testing`,
        });
      }

      const narration = resolveNarration(opts.narration, log.generate);
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

      if (opts.structuredData !== undefined) {
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
      log.lastGeneratePrompt = streamOpts.prompt;

      const failure = resolveGenerateFailure(opts.generateFailure, log.generateStream);
      if (failure) {
        throw new NarrationError({
          kind: failure,
          message: `Fake ${failure} error for testing`,
        });
      }

      const narration = resolveNarration(opts.narration, log.generateStream);
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
