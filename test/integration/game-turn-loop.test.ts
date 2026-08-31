// Integration tests for the 5-step turn pipeline.
// Uses a fake Claude client so no real API calls are made.
// Validates state transitions, history, output structure, and failure behavior.

import { describe, it, expect, vi } from 'vitest';
import { createProfile } from '@ai-rpg-engine/character-profile';
import { createHarness } from '../helpers/game-harness.js';
import { NarrationError } from '../../src/llm/claude-errors.js';
import { FALLBACK_NARRATION_REPEATED } from '../../src/narrator/narrator.js';
import type { McpToolCall } from '../../src/runtime/audio-bridge.js';
import { getPackById } from '../../src/character/packs.js';
import { renderConcludeOutput } from '../../src/game/game-presenter.js';

// ─── Happy Path ───────────────────────────────────────────────

describe('turn pipeline — happy path', () => {
  it('valid look command completes all 5 stages', async () => {
    const h = createHarness();

    const output = await h.play('look around');

    // Engine resolved (inspect event happened)
    expect(h.turnCount()).toBe(1);
    expect(h.lastVerb()).toBe('look');

    // Narration was produced (fake client returns text)
    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');

    // History was recorded
    expect(h.session.history.getAll()[0].playerInput).toBe('look around');
  });

  it('move command changes engine location and records history', async () => {
    const h = createHarness();

    const locationBefore = h.session.engine.world.locationId;
    expect(locationBefore).toBe('chapel-entrance');

    await h.play('go to chapel-nave');

    expect(h.session.engine.world.locationId).toBe('chapel-nave');
    expect(h.turnCount()).toBe(1);
    expect(h.lastVerb()).toBe('move');
  });

  it('engine truth is preserved regardless of narration content', async () => {
    const h = createHarness({
      clientOpts: { narration: 'The stars whisper of forgotten gods.' },
    });

    await h.play('go to chapel-nave');

    // Engine state reflects the move, not the narration
    expect(h.session.engine.world.locationId).toBe('chapel-nave');
  });

  it('attack command produces combat events and XP hints', async () => {
    const h = createHarness();

    await h.play('attack pilgrim');

    expect(h.turnCount()).toBe(1);
    expect(h.lastVerb()).toBe('attack');
    // Engine tick advanced
    expect(h.tick()).toBeGreaterThan(0);
  });

  it('multiple turns accumulate in history correctly', async () => {
    const h = createHarness();

    await h.play('look around');
    await h.play('go to chapel-nave');
    await h.play('look around');

    expect(h.turnCount()).toBe(3);
    expect(h.session.history.getAll()[0].verb).toBe('look');
    expect(h.session.history.getAll()[1].verb).toBe('move');
    expect(h.session.history.getAll()[2].verb).toBe('look');
  });

  it('presentation output contains narration text', async () => {
    const h = createHarness({
      clientOpts: { narration: 'Shadows cling to broken pews.' },
    });

    const output = await h.play('look around');
    expect(output).toContain('Shadows cling to broken pews.');
  });
});

// ─── Control Path ─────────────────────────────────────────────

describe('turn pipeline — control path', () => {
  it('no-op look does not corrupt state', async () => {
    const h = createHarness();
    const locationBefore = h.session.engine.world.locationId;

    await h.play('look');
    await h.play('look');

    // Location unchanged
    expect(h.session.engine.world.locationId).toBe(locationBefore);
    expect(h.turnCount()).toBe(2);
  });

  it('repeated commands update history each time', async () => {
    const h = createHarness();

    await h.play('look around');
    await h.play('look around');
    await h.play('look around');

    expect(h.turnCount()).toBe(3);
    // Each turn is a distinct record
    const inputs = h.session.history.getAll().map((t) => t.playerInput);
    expect(inputs).toEqual(['look around', 'look around', 'look around']);
  });

  it('slash commands do not consume turns', async () => {
    const h = createHarness();

    await h.play('/director');
    expect(h.turnCount()).toBe(0);
    expect(h.session.mode).toBe('director');

    await h.play('/back');
    // /back triggers getOpeningNarration(), which unconditionally records a
    // turn in history (game.ts:479, F-8da2e6f7 — carries isFallback for
    // recap filtering the same way every other turn does), so this DOES
    // consume a turn unlike /director above. Whether /back *should* be
    // turn-count-neutral is a game.ts design question — this just pins
    // what it actually does today.
    expect(h.session.mode).toBe('play');
    expect(h.turnCount()).toBe(1);
  });

  it('quit returns sentinel without state change', async () => {
    const h = createHarness();
    const output = await h.play('quit');
    expect(output).toBe('__QUIT__');
    expect(h.turnCount()).toBe(0);
  });
});

// ─── Narration Failure ────────────────────────────────────────

describe('turn pipeline — narration failure', () => {
  it('timeout still preserves engine state and returns output', async () => {
    const h = createHarness({
      clientOpts: { generateFailure: 'timeout' },
    });

    // F-f53130d8: capture real engine state before either turn so the
    // "did not corrupt the session" claim below is actually checked, not
    // just implied by the fallback text repeating on a second call.
    const tickBefore = h.tick();
    const locationBefore = h.session.engine.world.locationId;

    // F-304fc328 contract: non-fatal narration failures (timeout/rate-limit/
    // transport) degrade to a fallback narration instead of throwing — the
    // turn resolves and play can continue.
    const out = await h.play('look around');
    expect(out).toContain('The scene holds its breath');

    // A subsequent turn still works — the failure did not corrupt the session.
    // F-940cd4d0: as the 2nd consecutive fallback it renders the repeat-aware
    // outage message, not the isolated-hiccup text turn 1 got above.
    const out2 = await h.play('look around');
    expect(out2).toContain(FALLBACK_NARRATION_REPEATED);

    // Engine truth is unaffected by the narration fallback: 'look' never
    // changes location, the engine tick still advances exactly once per
    // turn (submitAction runs before narration and isn't rolled back when
    // narrateScene swallows the failure), and both turns were recorded.
    expect(h.session.engine.world.locationId).toBe(locationBefore);
    expect(h.tick()).toBe(tickBefore + 2);
    expect(h.turnCount()).toBe(2);
  });

  // F-bf400714: every failure case above (and the fake client's own prior
  // shape) can only script "every call fails identically" -- there was no
  // way to express a transient outage that clears mid-session, even though
  // that is exactly what production's real retry path (withRetry in
  // src/llm/claude-adapter.ts, invisible below the ClaudeClient interface
  // this fake substitutes for) exists to recover from. This proves one bad
  // turn doesn't read as the whole session degrading: turn 2's injected
  // retryable failure degrades to fallback narration while turns 1 and 3,
  // on the same harness/session, still show real narration text.
  it('a transient failure on one turn does not degrade the turns before or after it', async () => {
    const h = createHarness({
      clientOpts: {
        narration: 'The chapel breathes around you.',
        generateFailure: (callNumber) => (callNumber === 2 ? 'timeout' : undefined),
      },
    });

    const out1 = await h.play('look');
    const out2 = await h.play('look');
    const out3 = await h.play('look');

    expect(out1).toContain('The chapel breathes around you.');
    expect(out2).toContain('The scene holds its breath');
    expect(out3).toContain('The chapel breathes around you.');

    // All three turns still resolved and were recorded -- the mid-session
    // outage degraded narration quality for one turn, not the session.
    expect(h.turnCount()).toBe(3);
    expect(h.callLog.generate).toBe(3);
  });

  it('auth failure throws fatal NarrationError', async () => {
    const h = createHarness({
      clientOpts: { generateFailure: 'auth' },
    });

    await expect(h.play('look around')).rejects.toThrow(NarrationError);
    try {
      await h.play('look');
    } catch (e) {
      expect(e).toBeInstanceOf(NarrationError);
      expect((e as NarrationError).fatal).toBe(true);
    }
  });

  it('rate-limit failure degrades to fallback narration (non-fatal, retryable kind)', async () => {
    const h = createHarness({
      clientOpts: { generateFailure: 'rate-limit' },
    });

    // F-304fc328 contract: rate-limit is a non-fatal kind — after withRetry
    // exhausts its budget the narrator returns fallback narration rather than
    // throwing. Unconditional assertion (F-bfc23b00 discipline): this fails
    // for real if the fallback contract regresses in either direction.
    const out = await h.play('look around');
    expect(out).toContain('The scene holds its breath');
  });

  it('interpretation failure (structured) resolves to the in-fiction clarification (F-d026f78d)', async () => {
    // "xyzzy" won't match any fast-path pattern, so interpretAction calls the
    // slow path (generateStructured), which fails here. This is the deliberate
    // inversion the old propagating-behavior test demanded of "a future fix":
    // wave 14 landed that fix — a non-fatal interpretation failure now resolves
    // to the low-confidence clarification path instead of a system error box,
    // consumes no billed narration, and the session continues.
    const h = createHarness({
      clientOpts: { structuredFailure: 'timeout' },
    });

    const out = await h.play('xyzzy');
    expect(out).toContain("I'm not sure what you mean");
    // The clarification exchange IS recorded (one history turn) so the next
    // interpretation call carries the "was asked to clarify" context.
    expect(h.turnCount()).toBe(1);

    // The session is not stranded — a normal turn still works afterward.
    const out2 = await h.play('look around');
    expect(typeof out2).toBe('string');
    expect(h.turnCount()).toBe(2);
  });

  it('fast-path commands bypass Claude entirely', async () => {
    const h = createHarness({
      clientOpts: {
        // Both fail — but fast-path "look" never calls Claude for interpretation
        structuredFailure: 'auth',
      },
    });

    // "look" matches fast path, so generateStructured is never called.
    // But narrateScene still calls generate(), which succeeds (no generateFailure set).
    const output = await h.play('look');
    expect(output).toBeTruthy();
    expect(h.turnCount()).toBe(1);
    // Structured was never called
    expect(h.callLog.generateStructured).toBe(0);
    // Generate was called for narration
    expect(h.callLog.generate).toBeGreaterThan(0);
  });
});

// ─── Presentation Seam Integration (F-f9b5f874) ──────────────

// F-79a25863 (presentation seam contract) is unit-tested in src/game.test.ts
// against GameSession directly, but every one of those cases either passes
// no onPresentation callback or mocks the adjacent boundary with
// vi.spyOn(h.session.immersion, 'processPresentation') -- none of them drive
// a real turn far enough to let the actual hook pipeline (hooks.ts's
// combatStartHook -> ImmersionRuntime.fireEventHooks ->
// VoiceSoundboardBridge) compute a genuine McpToolCall. These cases fill
// that gap: real createHarness() turns, onPresentation wired through
// gameOpts exactly like game-harness.ts's opts.gameOpts spread documents,
// and no mock anywhere on the immersion/presentation path.
describe('presentation seam — real turn integration (F-f9b5f874)', () => {
  it('invokes onPresentation with an empty array after an ordinary turn that enters no new presentation state', async () => {
    const onPresentation = vi.fn();
    const h = createHarness({ gameOpts: { onPresentation } });

    await h.play('look around');

    expect(onPresentation).toHaveBeenCalledTimes(1);
    expect(onPresentation).toHaveBeenCalledWith([]);
  });

  it('delivers the real hook-triggered combat-start cues to onPresentation from a genuine combat turn', async () => {
    const onPresentation = vi.fn();
    const h = createHarness({ gameOpts: { onPresentation } });

    // Defensive fixture setup, not a mock of anything under test: a fresh
    // createGame() world's player starts with only 8 stamina and "attack"
    // costs some of it, and the hit/miss roll is genuinely RNG-driven, so
    // without pinning, "attack" could resolve as a stamina-rejected no-op
    // (no combat.* event at all) instead of combat.contact.miss/hit. Pinning
    // both combatants' resources directly on the real engine -- the same
    // idiom src/action-interpreter.test.ts already uses against a real
    // createGame() engine (`engine.world.entities[engine.world.playerId]`)
    // -- makes this test's outcome depend only on the real presentation seam
    // under test, not on the RNG roll or starting resource levels.
    // Pilgrim's hp is pinned high too so the hit/miss roll can't coincidentally
    // one-shot it into combat.entity.defeated, which would route this turn
    // through combatEndHook (aftermath) instead of the combat-start seam
    // this case exists to prove.
    //
    // F-1c93a004 (wave-2 tests domain): an earlier revision of this comment
    // attributed the low-stamina risk to createGame() "observed (empirically,
    // against this exact dependency version)" to share player.resources.stamina
    // across separate calls within one process. That premise is false at
    // every dependency version this repo has ever pinned: WorldStore.
    // addEntity() detaches its argument via structuredClone at ingestion --
    // engine CHANGELOG.md credits this as v2.7.0's root-cause fix for the
    // F-71ec5dcd cross-instance state-bleed class, two-plus minor versions
    // before this repo's original 2.9.0 pin, and it is unchanged at the
    // current 3.9.0 (ai-rpg-engine/packages/core/src/world.ts). Each
    // createGame() call already gets its own independent world; the pins
    // above exist to stabilize the RNG-driven hit/miss outcome
    // deterministically, not to work around a real leak.
    const world = h.session.engine.world;
    world.entities[world.playerId].resources.stamina = 999;
    const pilgrim = Object.values(world.entities).find((e) => e.id === 'pilgrim');
    if (!pilgrim) throw new Error('fixture: "pilgrim" entity not found in the starting zone');
    pilgrim.resources.hp = 999;

    // First combat action of the session: the presentation state machine
    // starts at 'exploration' (PresentationStateMachine's default), so this
    // turn's combat.* event(s) flip it to 'combat' for the first time,
    // which is exactly the justEnteredCombat gate hooks.ts's
    // combatStartHook (and ImmersionRuntime.fireEventHooks's dispatch of
    // it) requires to fire.
    await h.play('attack pilgrim');

    expect(onPresentation).toHaveBeenCalledTimes(1);
    const [calls] = onPresentation.mock.calls[0] as [McpToolCall[]];
    // combatStartHook's sfxCues + musicCue, executed for real through
    // VoiceSoundboardBridge (audio-bridge.ts) -- not asserting the
    // soundpack-core registry's effect-name mapping here, since that
    // lookup table belongs to a separate dependency; intensity/action/fadeMs
    // are this repo's own hooks.ts values.
    expect(calls).toContainEqual({
      tool: 'sound_effect',
      params: expect.objectContaining({ intensity: 0.8 }),
    });
    expect(calls).toContainEqual({
      tool: '__music_intent__',
      params: expect.objectContaining({ action: 'intensify' }),
    });
  });

  it('does not let a throwing onPresentation sink damage a real combat turn (mirrors PB-001 containment)', async () => {
    const onPresentation = vi.fn(() => {
      throw new Error('sink exploded');
    });
    const h = createHarness({ gameOpts: { onPresentation } });

    const world = h.session.engine.world;
    world.entities[world.playerId].resources.stamina = 999;

    const output = await h.play('attack pilgrim');

    expect(output).toBeTruthy();
    expect(h.turnCount()).toBe(1);
    expect(onPresentation).toHaveBeenCalledTimes(1);
  });
});

// ─── Welcome Screen (F-d665f2ef) ──────────────────────────────

// GameSession.getWelcome() (game.ts:485-487) is a plain zero-argument
// public method trivially reachable from this file's own createHarness(),
// yet grepping test/** for getWelcome previously returned zero matches --
// this is the first screen every new player sees, with zero integration
// coverage. renderWelcome (src/display/play-renderer.ts:153-172) has
// substring-only unit assertions in the cross-domain file
// src/display/play-renderer.test.ts (outside this domain, read only for
// context), so even combined, nothing anywhere pinned this screen's actual
// line order or the tone-line's presence/absence when tone is omitted.
describe('getWelcome() — the first screen every new player sees (F-d665f2ef)', () => {
  it('renders title before tone before the /help hint, in that relative order', () => {
    const h = createHarness({
      gameOpts: { title: 'The Sundered Chapel', tone: 'dark fantasy, quiet dread' },
    });

    const lines = h.session.getWelcome().split('\n');
    // Substring search (not exact-line regex) tolerates colors.ts's ANSI
    // wrapping being on or off depending on the real test runner's stdout
    // TTY-ness -- this pins order/content, not color state.
    const titleIdx = lines.findIndex((l) => l.includes('The Sundered Chapel'));
    const toneIdx = lines.findIndex((l) => l.includes('dark fantasy, quiet dread'));
    const helpHintIdx = lines.findIndex((l) => l.includes('/help'));

    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(toneIdx).toBeGreaterThan(titleIdx);
    expect(helpHintIdx).toBeGreaterThan(toneIdx);
  });

  it('omits the tone line entirely (not a blank placeholder) when no tone is configured', () => {
    const withTone = createHarness({
      gameOpts: { title: 'The Sundered Chapel', tone: 'dark fantasy' },
    }).session.getWelcome();
    const withoutTone = createHarness({
      gameOpts: { title: 'The Sundered Chapel', tone: '' },
    }).session.getWelcome();

    expect(withTone).toContain('dark fantasy');
    expect(withoutTone).not.toContain('dark fantasy');
    // Genuinely absent: exactly one whole line fewer, not an empty
    // placeholder line left behind in its place (renderWelcome's `if
    // (tone)` guard skips the push entirely -- play-renderer.ts:158-160).
    expect(withoutTone.split('\n').length).toBe(withTone.split('\n').length - 1);
  });
});

// ─── Play Screen Structural Sections (F-3595c07b) ─────────────

// renderPlayScreen (src/display/play-renderer.ts:40-145) assembles ~9
// independently-gated sections for every ordinary turn, but before this,
// only one test in the whole file asserted anything about the returned
// string ('presentation output contains narration text' above), and only a
// narration substring. A regression that silently drops the status bar,
// doubles it, or reorders sections relative to the divider would have
// passed every existing test/** check. These pin relative line order
// across both status-bar branches (profileStatus vs. the legacy
// world-entity fallback) without snapshotting the whole screen, since
// narration text and the divider's terminal-width-dependent length are
// expected to vary.
describe('renderPlayScreen — structural section order (F-3595c07b)', () => {
  it('legacy status bar (no profile): turn divider, then narration, then status, then zone line', async () => {
    const h = createHarness({ clientOpts: { narration: 'Dust motes drift through broken glass.' } });

    const output = await h.play('look around');
    const lines = output.split('\n');

    const turnIdx = lines.findIndex((l) => l.includes('Turn 1'));
    const narrationIdx = lines.findIndex((l) => l.includes('Dust motes drift through broken glass.'));
    // The legacy branch's status line (play-renderer.ts:107) is built from
    // the world's own 'player' entity ("Wanderer" in the fantasy starter
    // content) plus its raw resource keys, joined with ' | '.
    const statusIdx = lines.findIndex((l) => l.includes('Wanderer') && l.includes('hp:'));
    const zoneIdx = lines.findIndex((l) => l.includes('Location:'));

    expect(turnIdx).toBeGreaterThanOrEqual(0);
    expect(narrationIdx).toBeGreaterThan(turnIdx);
    expect(statusIdx).toBeGreaterThan(narrationIdx);
    expect(zoneIdx).toBeGreaterThan(statusIdx);
  });

  it('enhanced status bar (with profile): the profile name/level line renders instead of the legacy line, same relative position', async () => {
    const pack = getPackById('chapel-threshold')!;
    const profile = createProfile(
      { name: 'Kael Ashwood', archetypeId: 'penitent-knight', backgroundId: 'oath-breaker', traitIds: [] },
      { vigor: 5, instinct: 5, will: 5 },
      { hp: 20, stamina: 8 },
      [],
      'chapel-threshold',
    );
    const h = createHarness({
      gameOpts: { profile, itemCatalog: pack.itemCatalog },
      clientOpts: { narration: 'Dust motes drift through broken glass.' },
    });

    const output = await h.play('look around');
    const lines = output.split('\n');

    const turnIdx = lines.findIndex((l) => l.includes('Turn 1'));
    const narrationIdx = lines.findIndex((l) => l.includes('Dust motes drift through broken glass.'));
    const statusIdx = lines.findIndex((l) => l.includes('Kael Ashwood'));
    const zoneIdx = lines.findIndex((l) => l.includes('Location:'));

    expect(turnIdx).toBeGreaterThanOrEqual(0);
    expect(narrationIdx).toBeGreaterThan(turnIdx);
    expect(statusIdx).toBeGreaterThan(narrationIdx);
    expect(zoneIdx).toBeGreaterThan(statusIdx);
    // Proves the enhanced branch genuinely rendered instead of the legacy
    // fallback (rather than this test coincidentally passing because both
    // branches happen to share some other substring).
    expect(output).not.toContain('Wanderer |');
  });
});

// ─── Director Mode — Live Session State (F-b54e8238) ──────────

// 'slash commands do not consume turns' above is the only place in
// test/** that ever enters director mode, and it immediately calls /back
// next -- only ever exercising the trivial renderDirectorHelp() return.
// executeDirectorCommand (src/display/director-renderer.ts:189+), which
// renders every real director-mode screen from ~20 live context fields
// GameSession hands it, was never invoked from anywhere in test/**. The
// cross-domain unit file src/display/director-renderer.test.ts (outside
// this domain, read only for context) hand-builds
// ExecuteDirectorCommandOptions directly, so it cannot prove GameSession
// wires its own live state through correctly end-to-end. /inspect <id> is
// used here (rather than e.g. /status or /map) because it needs no
// character profile to be configured -- it reads directly off
// `this.engine.world`, which every harness always has.
describe('director mode — executeDirectorCommand receives real live session state (F-b54e8238)', () => {
  it('a real director sub-command reflects live world state, not just the canned help screen', async () => {
    const h = createHarness();

    await h.play('/director');
    expect(h.session.mode).toBe('director');

    // "Suspicious Pilgrim" (@ai-rpg-engine/starter-fantasy's `pilgrim` NPC,
    // also used by the combat-seam tests above) is real content flowing
    // through GameSession's own `this.engine.world` -- proving this
    // command reflects the live session, not a hand-built fixture.
    const inspection = await h.play('/inspect pilgrim');
    expect(inspection).toContain('Suspicious Pilgrim');
    expect(inspection).toContain('pilgrim');

    await h.play('/back');
    expect(h.session.mode).toBe('play');
  });
});

// ─── Play Mode /help — QUICK REFERENCE Screen (F-b3bc04fb) ────

// Every other reachable screen in this describe block earned its own
// end-to-end proof once it turned out cross-domain unit coverage in
// isolation "cannot prove GameSession wires its own live state through
// correctly end-to-end" (F-b54e8238, line 509): Welcome (F-d665f2ef), Play
// Screen sections (F-3595c07b), Director Mode (F-b54e8238). /help never
// got the same treatment -- grepping test/** for the literal string
// '/help' only ever turns up the welcome screen's own hint-text assertion
// (line 408), never a real h.play('/help') invocation. /help is a real
// GameSession slash-command dispatch (src/game.ts:909) reachable from this
// file's own createHarness() with zero new infrastructure, and renders
// renderPlayHelp() -- per this repo's own already-fixed findings
// (F-1036ff43, F-92c348e1, F-d6f7107e, F-a17315ac), the single richest,
// most content-dense screen in the game. This proves the real command
// actually reaches that content end-to-end, the same way director mode
// was proven above, instead of only being covered by
// help-system.test.ts's isolated cross-domain unit calls.
describe('play mode /help — renderPlayHelp receives real GameSession dispatch (F-b3bc04fb)', () => {
  it('a real /help command reaches renderPlayHelp() end-to-end with real content, not a canned stub', async () => {
    const h = createHarness();

    const help = await h.play('/help');

    expect(help).toContain('QUICK REFERENCE');
    // F-92c348e1's fixed CRAFTING row -- proves the live PLAY_COMMANDS-
    // derived content actually flows through this real dispatch, not a
    // stale hand-rolled double.
    expect(help).toContain('craft <recipe>');
    // A real slash-command table entry (COMMANDS section).
    expect(help).toContain('/help leverage');
    // Mirrors the file's own established 'slash commands do not consume
    // turns' contract (line 120) for this specific command.
    expect(h.turnCount()).toBe(0);
  });
});

// ─── Campaign Conclusion Screen (F-4905e69f) ──────────────────

// renderConcludeOutput (src/game/game-presenter.ts:80-105) is the terminal
// screen GameSession.handleConclude() returns for '/conclude'
// (game.ts:889-890, 1872-1898) -- reachable from this file's existing
// createHarness() with no new infrastructure, yet grepping test/** for
// renderConcludeOutput previously returned zero matches. The epilogue
// block is gated on bare truthiness (`if (result.epilogue)`,
// game-presenter.ts:92) -- the exact silent-omission shape already-fixed
// finding F-0f76ecc2 flagged upstream in the narrator -- and nothing in
// test/** would have caught a regression reintroducing an empty epilogue,
// or breaking the divider/line assembly around it, in either branch.
//
// Two layers: a live end-to-end smoke test through the real
// harness/session (proves '/conclude' actually reaches this screen with a
// real generated epilogue), and direct calls against renderConcludeOutput
// with controlled inputs (pins the two branches' exact section order/
// blank-line shape without coupling to @ai-rpg-engine/campaign-memory's
// own nested formatting, which embeds its own 'CAMPAIGN CONCLUSION'
// sub-header and dividers inside deterministicSummary).
describe('renderConcludeOutput — the /conclude terminal screen (F-4905e69f)', () => {
  it('/conclude reaches renderConcludeOutput end-to-end with a real generated epilogue', async () => {
    const h = createHarness({
      clientOpts: { narration: 'The bells of the chapel ring once more, and then fall silent.' },
    });

    const output = await h.play('/conclude');

    expect(output).toContain('CAMPAIGN CONCLUSION');
    expect(output).toContain('The bells of the chapel ring once more, and then fall silent.');
    expect(h.session.campaignStatus).toBe('completed');
  });

  it('epilogue present: header, summary, epilogue (with its own divider), worldAfter, footer appear in order with blank-line discipline', () => {
    const output = renderConcludeOutput({
      deterministicSummary: '  Resolution: QUIET RETIREMENT',
      epilogue: 'The chapel bells ring again, calling no one.',
      worldAfter: '  === WORLD AFTER ===',
    });
    const lines = output.split('\n');

    expect(lines[0]).toBe('');
    expect(lines[2]).toBe('  CAMPAIGN CONCLUSION');
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('  Resolution: QUIET RETIREMENT');
    expect(lines[6]).toBe('');
    // lines[7] is the epilogue's own divider line -- present (non-blank).
    // Its exact fill-character solidity/width is covered by the dedicated
    // rule-solidity test below, not re-asserted here.
    expect(lines[7].trim().length).toBeGreaterThan(0);
    expect(lines[8]).toBe('');
    expect(lines[9]).toBe('  The chapel bells ring again, calling no one.');
    expect(lines[10]).toBe('');
    expect(lines[11]).toBe('  === WORLD AFTER ===');
    expect(lines[12]).toBe('');
    expect(lines[14]).toBe('  Continue playing  |  Type "save" to archive  |  /export md  |  Type "quit" to exit');
    expect(lines.length).toBe(15);
  });

  it('epilogue absent: summary transitions directly to worldAfter with no stray epilogue divider', () => {
    const output = renderConcludeOutput({
      deterministicSummary: '  Resolution: QUIET RETIREMENT',
      worldAfter: '  === WORLD AFTER ===',
    });
    const lines = output.split('\n');

    expect(lines[0]).toBe('');
    expect(lines[2]).toBe('  CAMPAIGN CONCLUSION');
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('  Resolution: QUIET RETIREMENT');
    expect(lines[6]).toBe('');
    expect(lines[7]).toBe('  === WORLD AFTER ===');
    expect(lines[8]).toBe('');
    expect(lines[10]).toBe('  Continue playing  |  Type "save" to archive  |  /export md  |  Type "quit" to exit');
    expect(lines.length).toBe(11);
  });

  it('an empty-string epilogue (the real "nothing generated" shape narrateFinale can return) is treated as absent, not a blank block', () => {
    // finale-narrator.ts's narrateFinale() never produces `undefined` --
    // a non-fatal generation failure resolves to the always-truthy
    // FALLBACK_EPILOGUE sentinel, and a *successful* call that happens to
    // return empty/whitespace-only text is the one real path that reaches
    // renderConcludeOutput with a falsy `epilogue: ''`. This pins that
    // exact shape, not just `undefined`.
    const output = renderConcludeOutput({
      deterministicSummary: '  Resolution: QUIET RETIREMENT',
      epilogue: '',
      worldAfter: '  === WORLD AFTER ===',
    });
    const lines = output.split('\n');

    expect(lines[5]).toBe('  Resolution: QUIET RETIREMENT');
    expect(lines[6]).toBe('');
    expect(lines[7]).toBe('  === WORLD AFTER ===');
    expect(lines.length).toBe(11);
  });

  // F-4905e69f (parallel-wave caveat): game-presenter.ts's header/footer
  // rules are built as '  ═'.repeat(30) / '  ─'.repeat(30) -- repeating the
  // WHOLE 3-character "  ═" pattern rather than the bare rule character,
  // which produces a gapped "  ═  ═  ═ ..." line 90 columns wide, not a
  // solid rule within a sane terminal width. This is a known target of a
  // sibling wave-16 fix in game-core/cli-display's own worktree (outside
  // this domain's src/game/game-presenter.ts), asserted here against the
  // CORRECT post-fix invariant. EXPECTED TO FAIL in THIS worktree until
  // that sibling fix lands in the cumulative tree -- see this agent's
  // summary for the cross-worktree divergence note; do not weaken this
  // assertion to match the current buggy output.
  it('header and footer rules render as a single solid character at a terminal-safe width <= 80 (F-4905e69f)', () => {
    // F-3e8bd7ed: the divider width is play-renderer.ts's getTerminalWidth(),
    // which reads process.stdout.columns (clamped 40-120, fallback 60) --
    // so this assertion is only TTY-independent if columns is stubbed, the
    // same pattern src/display/play-renderer-divider.test.ts already
    // establishes. Restored in `finally` regardless of test outcome.
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    try {
      const output = renderConcludeOutput({
        deterministicSummary: '  Resolution: QUIET RETIREMENT',
        worldAfter: '  === WORLD AFTER ===',
      });
      const lines = output.split('\n');
      const headerTop = lines[1];
      const headerBottom = lines[3];
      const footerRule = lines[lines.length - 2];

      for (const rule of [headerTop, headerBottom, footerRule]) {
        expect(rule.trimStart()).toMatch(/^[═─]+$/);
        expect(rule.length).toBeLessThanOrEqual(80);
      }
    } finally {
      Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
    }
  });
});
