// engine-state-validator.ts — PFE-007: validate a saved session's serialized
// engine state before it is assigned onto a freshly created engine.
//
// Extracted from bin.ts's runLoad() (F-6506450c) so the real validation
// logic — not a hand-copied fork of it — is what both production and tests
// exercise. Explicitly rejects `world.state === null` (F-1b8be73f): a bare
// `typeof x !== 'object'` check does not catch this because
// `typeof null === 'object'` in JavaScript, which let corrupted saves of
// the shape `{"world":{"state":null}}` silently reset the entire
// simulation world state via `Object.assign(engine.store.state, null)`
// (a documented no-op) without printing any error.

export type EngineStateValidation =
  | { valid: true; state: Record<string, unknown> }
  | { valid: false; error: string };

/** Validate a save file's serialized engine state string. */
export function validateEngineState(raw: string): EngineStateValidation {
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return { valid: false, error: 'not valid JSON' };
  }

  if (!saved || typeof saved !== 'object') {
    return { valid: false, error: 'missing world.state' };
  }

  const world = (saved as Record<string, unknown>).world;
  const state = world && typeof world === 'object' ? (world as Record<string, unknown>).state : undefined;

  // Explicit null and array checks: typeof null === 'object' AND
  // Array.isArray([]) is also typeof 'object' in JS, so a bare
  // `typeof state !== 'object'` check would accept both `state: null`
  // (F-1b8be73f) and an array-shaped state (F-911bf1ee) — e.g.
  // {"world":{"state":[1,2,3]}} — which Object.assign(engine.store.state, ...)
  // would then merge in by its enumerable index keys ('0','1','2') instead
  // of being rejected outright.
  if (state === null || Array.isArray(state) || typeof state !== 'object') {
    return { valid: false, error: 'missing world.state' };
  }

  return { valid: true, state: state as Record<string, unknown> };
}
