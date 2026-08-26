import { describe, it, expect } from 'vitest';
import {
  buildNarratePrompt,
  type SceneNarrationInput,
  CHRONICLE_CHAR_BUDGET,
  EVENTS_MAX_COUNT,
  EVENTS_CHAR_BUDGET,
  PRESSURES_MAX_COUNT,
  ENTITIES_MAX_COUNT,
  NARRATE_SYSTEM,
  SOUND_EFFECT_IDS,
} from './narrate-scene.js';

function makeInput(overrides: Partial<SceneNarrationInput> = {}): SceneNarrationInput {
  return {
    zoneName: 'Market Square',
    zoneTags: ['urban'],
    atmosphere: { light: 'normal', noise: 'moderate', stability: 'stable' },
    visibleEntities: [],
    recentEvents: [],
    playerState: { hp: 10, statuses: [] },
    exits: [],
    tone: 'dark fantasy',
    recentNarration: [],
    isNewZone: false,
    ...overrides,
  };
}

describe('buildNarratePrompt', () => {
  it('should render the zone, atmosphere, and tone', () => {
    const prompt = buildNarratePrompt(makeInput());
    expect(prompt).toContain('Market Square');
    expect(prompt).toContain('dark fantasy');
  });

  it('should not include a chronicle section when chronicleContext is absent', () => {
    const prompt = buildNarratePrompt(makeInput());
    expect(prompt).not.toContain('Chronicle');
  });

  // F-14316911: recentNarration's guard (narrate-scene.ts:114-116) omits the
  // entire 'Previous narration (for continuity)' block when the array is
  // empty, rather than rendering an empty-but-present header. This is the
  // production shape whenever every recent turn was a fallback sentinel (see
  // narrator.test.ts's F-e8630a73 all-fallback case) — locking it in here at
  // the unit level against a future regression in the ternary/slice.
  it('should not include a "Previous narration" section when recentNarration is empty', () => {
    const prompt = buildNarratePrompt(makeInput({ recentNarration: [] }));
    expect(prompt).not.toContain('Previous narration');
  });

  // F-7815df9e (game-core seam contract): chronicleContext folds into the prompt
  // as a compact long-term-memory section when present, so game-core can pass
  // condensed campaign-chronicle context into scene narration.
  it('should fold chronicleContext into the prompt as a compact long-term-memory section when present', () => {
    const prompt = buildNarratePrompt(
      makeInput({ chronicleContext: 'The player once spared the bandit chief.' }),
    );
    expect(prompt).toContain('Chronicle');
    expect(prompt).toContain('long-term memory');
    expect(prompt).toContain('The player once spared the bandit chief.');
  });
});

// F-9ee9b5a7: buildNarratePrompt previously included chronicleContext and the
// activePressures/recentEvents/visibleEntities arrays in full, with no cap of
// its own -- correctness today depended entirely on every upstream caller
// separately bounding its own context strings. These tests lock in a
// defensive ceiling enforced by the prompt builder itself, mirroring
// dialogue-npc.ts's formatConversationHistory pattern (cap chars, trim
// oldest-first / keep-most-recent).
describe('buildNarratePrompt F-9ee9b5a7: defensive prompt-size caps', () => {
  const pad = (i: number) => String(i).padStart(2, '0');

  it('caps recentEvents at EVENTS_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const events = Array.from({ length: EVENTS_MAX_COUNT + 10 }, (_, i) => `event-${pad(i)}`);
    const prompt = buildNarratePrompt(makeInput({ recentEvents: events }));

    const renderedCount = events.filter((e) => prompt.includes(`- ${e}`)).length;
    expect(renderedCount).toBeLessThanOrEqual(EVENTS_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    // Most recent (highest index) survives; oldest (index 0) is dropped.
    expect(prompt).toContain(`- event-${pad(events.length - 1)}`);
    expect(prompt).not.toContain('- event-00');
  });

  it('caps activePressures at PRESSURES_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const pressures = Array.from({ length: PRESSURES_MAX_COUNT + 10 }, (_, i) => `pressure-${pad(i)}`);
    const prompt = buildNarratePrompt(makeInput({ activePressures: pressures }));

    const renderedCount = pressures.filter((p) => prompt.includes(`- ${p}`)).length;
    expect(renderedCount).toBeLessThanOrEqual(PRESSURES_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    expect(prompt).toContain(`- pressure-${pad(pressures.length - 1)}`);
    expect(prompt).not.toContain('- pressure-00');
  });

  it('caps visibleEntities at ENTITIES_MAX_COUNT', () => {
    const entities = Array.from({ length: ENTITIES_MAX_COUNT + 10 }, (_, i) => ({
      name: `entity-${pad(i)}`,
      type: 'npc',
      clarity: 1,
    }));
    const prompt = buildNarratePrompt(makeInput({ visibleEntities: entities }));

    const renderedCount = entities.filter((e) => prompt.includes(`${e.name} (`)).length;
    expect(renderedCount).toBeLessThanOrEqual(ENTITIES_MAX_COUNT);
    expect(renderedCount).toBeLessThan(entities.length);
  });

  it('truncates chronicleContext beyond CHRONICLE_CHAR_BUDGET with a visible indicator', () => {
    const longChronicle = 'x'.repeat(CHRONICLE_CHAR_BUDGET + 500);
    const prompt = buildNarratePrompt(makeInput({ chronicleContext: longChronicle }));

    expect(prompt).toContain('[truncated]');
    expect(prompt).not.toContain(longChronicle);
  });

  it('leaves chronicleContext untouched when under the budget', () => {
    const shortChronicle = 'The player once spared the bandit chief.';
    const prompt = buildNarratePrompt(makeInput({ chronicleContext: shortChronicle }));

    expect(prompt).toContain(shortChronicle);
    expect(prompt).not.toContain('[truncated]');
  });

  it('enforces a char budget on recentEvents even under the count cap, dropping oldest first', () => {
    // A handful of long event lines (well under EVENTS_MAX_COUNT in count)
    // should still be trimmed once their combined length exceeds
    // EVENTS_CHAR_BUDGET -- proving the char ceiling is independent of the
    // count ceiling, not just a second way of expressing the same limit.
    const longLineLength = Math.floor(EVENTS_CHAR_BUDGET / 2) + 50;
    const longEvents = Array.from({ length: 5 }, (_, i) => `event-${pad(i)}-` + 'y'.repeat(longLineLength));
    const prompt = buildNarratePrompt(makeInput({ recentEvents: longEvents }));

    // The most recent long event survives; the oldest is trimmed once the
    // char budget is exceeded, well before all 5 (well under EVENTS_MAX_COUNT)
    // would have fit by count alone.
    expect(prompt).toContain(longEvents[longEvents.length - 1]);
    expect(prompt).not.toContain(longEvents[0]);
  });
});

// F-a465383c: NARRATE_SYSTEM's "Available sound effects"/"Available ambient
// layers" prose offered the LLM only bare internal machine ids (ui_notification,
// ambient_white_noise, etc.) with no display-name guidance and no explicit
// instruction to stick to the list -- nothing downstream constrains the field
// to it either (@ai-rpg-engine/presentation's isValidNarrationPlan only checks
// typeof effectId/layerId === 'string', no enum). This in-domain half pairs
// each id with a humanized gloss and an explicit "use these exact ids only"
// instruction, strengthening the soft-constraint the LLM sees at generation
// time. The actual render-time humanization (presentation-renderer.ts
// interpolating the raw registry token, e.g. 'white_noise' with the
// underscore intact, into the on-screen cue line) is cross-domain
// (src/cli/**, src/runtime/**) and is NOT fixed by this prompt-text-only
// change -- see this wave's skipped[] entry.
describe('NARRATE_SYSTEM sfx/ambient id guidance (F-a465383c)', () => {
  it('instructs the LLM to use only the listed sound-effect/ambient ids, not invent new ones', () => {
    expect(NARRATE_SYSTEM).toMatch(/use (only |these )?exact ids/i);
  });

  // Coordinator Brief contract #7: the sound-effect id list is now
  // single-sourced from the exported SOUND_EFFECT_IDS const (this test used
  // to hardcode its own second copy of the same 10 ids -- deriving from the
  // export instead of a parallel literal is what actually proves
  // single-sourcing, matching claude-adapter.test.ts's F-aaaa105f precedent
  // of asserting against the shared constant rather than a re-hardcoded one).
  it('pairs every SOUND_EFFECT_IDS id with a humanized gloss', () => {
    for (const id of Object.keys(SOUND_EFFECT_IDS)) {
      expect(NARRATE_SYSTEM, `expected a gloss in parens after ${id}`).toMatch(new RegExp(`${id} \\([^)]+\\)`));
    }
  });

  it('pairs every listed ambient-layer id with a humanized gloss', () => {
    const ids = ['ambient_rain', 'ambient_white_noise', 'ambient_drone'];
    for (const id of ids) {
      expect(NARRATE_SYSTEM, `expected a gloss in parens after ${id}`).toMatch(new RegExp(`${id} \\([^)]+\\)`));
    }
  });
});

// Coordinator Brief contract #7: `export const SOUND_EFFECT_IDS` from this
// file -- the 10-id sound list extracted to ONE exported const consumed by
// both this prompt builder and cli-display's humanization parity tripwire
// (src/cli/**, src/runtime/** -- see F-a465383c's own note that render-time
// humanization is cross-domain). The prompt text renders FROM this const, no
// second hardcoded copy.
describe('SOUND_EFFECT_IDS (Coordinator Brief contract #7)', () => {
  it('exports exactly the 10 sound-effect ids the prompt has always advertised, each with a display gloss', () => {
    expect(Object.keys(SOUND_EFFECT_IDS).sort()).toEqual(
      ['alert_critical', 'alert_info', 'alert_warning', 'ui_attention', 'ui_click', 'ui_error', 'ui_notification', 'ui_pop', 'ui_success', 'ui_whoosh'].sort(),
    );
    for (const gloss of Object.values(SOUND_EFFECT_IDS)) {
      expect(typeof gloss).toBe('string');
      expect(gloss.length).toBeGreaterThan(0);
    }
  });
});
