// F-394f583d (wave 18, tests domain): a minimal scripted double for
// node:readline's Interface, so src/character/builder.ts's promptText/
// promptMenu/promptMultiSelect/promptConfirm (src/character/prompts.ts) can
// be driven from a test without a real TTY. game-harness.ts only ever fakes
// the Claude client (test/helpers/fake-claude-client.ts) -- nothing in
// test/** previously faked readline, so every character-creation-flow call
// site (builder.ts's buildCharacter(), and anything else that takes an
// rl: ReadlineInterface) had zero integration coverage.
//
// Deliberately "minimal": a sequential queue of canned answers, each
// `question()` call consuming the next one in order -- not prompt-text-aware
// dispatch. This mirrors this repo's own fake-claude-client.ts philosophy
// (a plain stand-in, not a simulation of the real thing) and keeps the
// double trivial to reason about: the caller is expected to know the exact
// prompt sequence a given script will walk through (same discipline a real
// scripted CLI test already requires), not to have the double guess intent
// from prompt copy that could itself change.

import type { Interface as ReadlineInterface } from 'node:readline';

export type FakeReadline = ReadlineInterface & {
  /** Answers consumed so far, in order -- useful for asserting a script ran to completion. */
  readonly consumed: readonly string[];
  /** Answers not yet consumed. */
  readonly remaining: readonly string[];
};

/**
 * Creates a fake readline.Interface whose question() resolves each call with
 * the next entry in `answers`, in order. Once exhausted, further question()
 * calls resolve with '' (mirroring a real terminal's EOF-ish "nothing
 * typed" rather than throwing) so a script that over-runs its answer list
 * fails on an assertion downstream instead of crashing inside the fake
 * itself.
 */
export function createFakeReadline(answers: string[]): FakeReadline {
  const queue = [...answers];
  const consumed: string[] = [];

  // Typed structurally rather than as Partial<ReadlineInterface>: the real
  // Interface's question() is overloaded (with an Abortable variant this
  // double never needs), so satisfying it verbatim is impossible for a
  // minimal stub — the unknown-mediated cast at the return is the same
  // escape the repo's mockStream double already uses (F-0b96939a).
  const fake = {
    question(_prompt: string, callback: (answer: string) => void): void {
      const answer = queue.length > 0 ? queue.shift()! : '';
      consumed.push(answer);
      // Real readline's question() callback fires asynchronously (after a
      // keypress/line event) -- deferring via queueMicrotask keeps this
      // double honest about that instead of resolving promptText's wrapping
      // Promise fully synchronously, which could mask an accidental
      // synchronous-assumption bug in a caller.
      queueMicrotask(() => callback(answer));
    },
    close(): void {
      /* no-op */
    },
    // Coordinator stitch (wave 6): F-3a8ccf9c's promptText registers
    // rl.once('close', …) and removes it with rl.off(…) so stdin-EOF can't
    // hang character creation. This double answers every question and never
    // closes, so inert listener registration is the faithful behavior.
    once(): void {
      /* no-op — see above */
    },
    off(): void {
      /* no-op — see above */
    },
    get consumed() {
      return consumed;
    },
    get remaining() {
      return queue;
    },
  };

  return fake as unknown as FakeReadline;
}
