import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderPresentationCues, insertCuesBeforePrompt } from './presentation-renderer.js';
import type { McpToolCall } from '../runtime/audio-bridge.js';
import { CORE_SOUND_PACK, SoundRegistry } from '@ai-rpg-engine/soundpack-core';

// F-08f594de: terminal-renderer half of the presentation seam contract
// (wave-8/cli-display.md). VoiceSoundboardBridge.flush() (runtime/audio-bridge.ts,
// out of scope here, read-only) queues McpToolCall entries every turn for
// sfx/ambient/music cues and UI-effect intents (e.g. deathHook's fade-to-black,
// runtime/hooks.ts:190). Before this file existed nothing downstream of that
// queue ever printed them — F-6ef6e5a0 (closed) only got hook-triggered UI
// effects as far as the bridge's own internal pendingCalls array; its own
// applyUiEffect comment says terminal rendering is "owned by the terminal
// renderer, not this audio bridge." This is that renderer.
//
// These tests exercise the pure mapping function in isolation. The other
// half of the wiring (game.ts's onPresentation callback feeding bin.ts,
// which calls this function) is a cross-domain seam that can't be exercised
// by a scoped test run in this worktree alone — see bin.ts's
// `withPresentationHook` doc comment.

describe('renderPresentationCues', () => {
  it('renders nothing for an empty call list', () => {
    expect(renderPresentationCues([])).toBe('');
  });

  it('maps a sound_effect call carrying intensity (an SfxCue) to an sfx cue line', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('alert');
    expect(text).toContain('sounds');
    expect(text).toContain('·'); // ·  cue bullet
  });

  it('maps a sound_effect call carrying volume instead of intensity (an AmbientCue, per setAmbient) to a distinct ambient cue line', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'ambient_rain', volume: 0.4 } },
    ];
    const text = renderPresentationCues(calls);
    // F-7eb33249: 'ambient_rain' isn't a registered voiceSoundboardEffect
    // token (the registry's real ambient ids are rain/white_noise/drone --
    // see core-pack.js -- 'ambient_rain' is a narrate-scene.ts-level id, one
    // layer up), so it falls through to the generic underscore-strip
    // fallback rather than the curated label map. Either way the raw
    // underscored token must never reach the screen -- that's this finding's
    // whole point, so this test now asserts the humanized form, not the
    // pre-fix raw one.
    expect(text).toContain('ambient rain');
    expect(text).not.toContain('ambient_rain');
    expect(text).toContain('ambient');
    // Must be visibly distinct from the sfx phrasing, since both share the
    // same 'sound_effect' tool name and are only told apart by which params
    // field is present.
    expect(text).not.toContain('sounds');
  });

  it('maps a __music_intent__ intensify call (combatStartHook) to a music cue line', () => {
    const calls: McpToolCall[] = [
      { tool: '__music_intent__', params: { action: 'intensify', fadeMs: 300 } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('music');
    expect(text).toContain('intensif');
  });

  it('maps a __music_intent__ soften call (combatEndHook) to a music cue line', () => {
    const calls: McpToolCall[] = [
      { tool: '__music_intent__', params: { action: 'soften', fadeMs: 1000 } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('music');
    expect(text).toContain('soften');
  });

  // F-53ca7db8: renderMusicLine's switch had no case for 'sting' -- engine
  // 3.9's AudioDirector.scheduleSting() (COMBAT_STING_MAP's
  // music_victory_sting/music_defeat_sting) isn't wired to fire yet
  // (F-7ea45830, deferred), but audio-bridge.ts's executeCommands() already
  // force-casts the runtime string 'sting' past MusicCue's narrower action
  // type via an `as` cast, so this renderer -- not audio-bridge.ts -- is
  // what actually receives that value once the upstream gap closes. Before
  // this fix it fell through to the generic 'play' default and silently
  // rendered as '  · music starts', indistinguishable from an ordinary
  // track starting.
  it('maps a __music_intent__ sting call to distinct phrasing, not the generic "music starts" default (F-53ca7db8)', () => {
    const calls: McpToolCall[] = [
      { tool: '__music_intent__', params: { action: 'sting' } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('music');
    expect(text).toContain('sting');
    expect(text).not.toContain('starts');
  });

  // F-53ca7db8 (part 2): an action value that is neither a known cue nor
  // 'play' must not claim the specific "starts" phrasing either -- that
  // claim is only true for an explicit 'play'. A still-unrecognized future
  // value falls to a neutral default instead.
  it('does not claim "music starts" for an unrecognized action value that is not "play"', () => {
    const calls: McpToolCall[] = [
      { tool: '__music_intent__', params: { action: 'some-future-action' } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('music');
    expect(text).not.toContain('starts');
  });

  // F-488e6621: before this fix, a victory sting, a defeat sting, and (at
  // engine 3.11) a retreat sting all rendered the SAME generic
  // '  · a sting of music' line -- renderMusicLine only ever read
  // `params.action === 'sting'`, never `params.trackId`, even though
  // audio-bridge.ts's setMusic (runtime/audio-bridge.ts:120-127) already
  // forwards `trackId: cue.trackId` on every __music_intent__ call. Observed
  // red before the fix: all three assertions below failed because
  // renderMusicLine had no STING_LABELS lookup at all -- every trackId
  // produced the identical 'a sting of music' text, so a player could not
  // tell a win from a loss from a fled encounter.
  it.each([
    ['music_victory_sting', 'triumph'],
    ['music_defeat_sting', 'loss'],
    ['music_retreat_sting', 'retreat'],
  ])('gives the %s trackId its own distinct sting phrasing ("%s")', (trackId, expectedWord) => {
    const text = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting', trackId } },
    ]);
    expect(text).toContain('sting');
    expect(text).toContain(expectedWord);
  });

  it('renders three DIFFERENT lines for victory/defeat/retreat stings (no two trackIds collapse to the same text)', () => {
    const victory = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting', trackId: 'music_victory_sting' } },
    ]);
    const defeat = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting', trackId: 'music_defeat_sting' } },
    ]);
    const retreat = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting', trackId: 'music_retreat_sting' } },
    ]);
    expect(new Set([victory, defeat, retreat]).size).toBe(3);
  });

  it('falls back to the pre-existing generic sting line for an unrecognized trackId (or none at all), never throwing or rendering "undefined"', () => {
    const unknownTrack = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting', trackId: 'some_future_sting' } },
    ]);
    const noTrack = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting' } },
    ]);
    expect(unknownTrack).toContain('a sting of music');
    expect(noTrack).toContain('a sting of music');
  });

  it('maps the __ui_effect_intent__ fade-out (deathHook fade-to-black) to a blank-screen sequence: newlines + a rule distinct from the routine divider, not ANSI art', () => {
    const calls: McpToolCall[] = [
      { tool: '__ui_effect_intent__', params: { type: 'fade-out', durationMs: 2000, color: '#000' } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('\n\n');
    // F-cbd65014: renderScreenPause() used to render character-for-character
    // the same '─' rule as play-renderer.ts's makeDivider() -- the routine
    // divider printed on every ordinary turn -- so the one moment built to
    // look different (player death) had no visual signature of its own. It
    // must use a different rule character (matching makeTurnDivider()'s '═'
    // treatment) so it reads as distinct from an everyday divider.
    expect(text).toMatch(/═{5,}/);
    expect(text).not.toMatch(/─{5,}/);
    // Honest terminal equivalent, not simulated ANSI color art: no color
    // literal from the intent (e.g. its '#000') should leak into the output.
    expect(text).not.toContain('#000');
  });

  it('does not render a line for a speak call (narration/dialogue text is already printed by play-renderer.ts)', () => {
    const calls: McpToolCall[] = [
      { tool: 'speak', params: { text: 'Hello there', voice: 'narrator' } },
    ];
    expect(renderPresentationCues(calls)).toBe('');
  });

  it('joins multiple cues from the same turn on separate lines', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
      { tool: '__music_intent__', params: { action: 'intensify', fadeMs: 300 } },
    ];
    const text = renderPresentationCues(calls);
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(2);
  });

  it('renders no raw ANSI escape codes when colors are disabled (default test env: non-TTY stdout)', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
    ];
    expect(renderPresentationCues(calls)).not.toContain('\x1b[');
  });
});

// F-08f594de: "Respect the colors.ts enabled gate (no raw ANSI when colors
// are off)" — mirrors colors.test.ts's own pattern for proving the gate
// actually wires through, not just that plain text happens to render.
describe('renderPresentationCues with color enabled', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
  });

  it('wraps the sfx cue in ANSI codes when stdout is a TTY and NO_COLOR is unset', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./presentation-renderer.js');
    const text = mod.renderPresentationCues([
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
    ]);
    expect(text).toContain('\x1b[');
  });

  // F-06e3bd9e: renderSfxLine used to be the only one of the four cue-line
  // renderers (sfx/ambient/music/ui-effect-fallback) wrapped in italic() on
  // top of dim() -- a player would see '· gunshot sounds' in a different
  // font style than the otherwise-identical-looking '· ambient: wind' or
  // '· music starts' lines around it, with nothing pinning that as
  // intentional. Fixed by dropping italic so all four share the same plain
  // dim() treatment; this test locks that convention in.
  it('does not wrap the sfx cue line in italic, matching the plain dim() treatment ambient/music/ui-effect cues use (F-06e3bd9e)', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./presentation-renderer.js');
    const sfx = mod.renderPresentationCues([
      { tool: 'sound_effect', params: { effect: 'gunshot', intensity: 0.9 } },
    ]);
    const ambient = mod.renderPresentationCues([
      { tool: 'sound_effect', params: { effect: 'wind', volume: 0.3 } },
    ]);
    const music = mod.renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'play' } },
    ]);
    // ANSI italic is SGR code 3 -- '\x1b[3m'.
    expect(sfx).not.toContain('\x1b[3m');
    expect(ambient).not.toContain('\x1b[3m');
    expect(music).not.toContain('\x1b[3m');
    // Still colored (dim, SGR code 2) -- proves this is a same-treatment
    // fix, not an accidental "colors disabled" false pass.
    expect(sfx).toContain('\x1b[2m');
  });

  // F-cbd65014: the fade-out pause must render in a visually distinct color
  // (critical/bold red, matching colors.ts's own "Critical danger / death"
  // doc for this composite) from the plain dim rules used elsewhere, not
  // just a different character -- so a colorblind-safe textual/character
  // signature (the '═' character itself, asserted above under default
  // colors-disabled) is reinforced, not replaced, by color for players who
  // do have it.
  it('renders the fade-out pause in critical (bold red), not the plain dim styling of an ordinary divider', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./presentation-renderer.js');
    const text = mod.renderPresentationCues([
      { tool: '__ui_effect_intent__', params: { type: 'fade-out', durationMs: 2000 } },
    ]);
    expect(text).toContain('\x1b[31m'); // red
    expect(text).toContain('\x1b[1m'); // bold
  });
});

// F-135b1970 / F-e78d68c1: bin.ts's per-turn loop used to console.log() the
// turn's presentation cues in a call AFTER the full rendered screen, which
// already ends with play-renderer.ts's renderPlayScreen "What do you do?"
// prompt and its trailing blank line -- so cues describing what just
// happened landed BELOW the question asking what the player wants to do
// next, sandwiched between the prompt and the actual '  > ' input marker.
//
// The real per-turn call chain is bin.ts -> GameSession.processInput()
// (game.ts, game-core) -> renderPlayOutput() (game/game-presenter.ts,
// game-core) -> renderPlayScreen() (play-renderer.ts, owned here) --
// game-presenter.ts sits outside cli-display's edit scope this wave, so
// there is no seam to thread cues into renderPlayScreen's own composition
// from bin.ts. This function instead operates on the already-rendered
// screen string bin.ts receives back, anchored on renderPlayScreen's own
// "What do you do?" prompt line -- both the anchor and this function are
// this domain's code, so the anchor is a stable in-domain contract rather
// than a guess at game-core's internals.
describe('insertCuesBeforePrompt (F-135b1970 / F-e78d68c1)', () => {
  const screen = [
    'Narration text about the scene.',
    '',
    '·············',
    '  Hero (Lv1) | HP: 10',
    '  Location: Town',
    '──────────',
    '',
    '  What do you do?',
    '',
  ].join('\n');

  it('places the cues before the "What do you do?" prompt line', () => {
    const cues = '  · rain sounds';
    const result = insertCuesBeforePrompt(screen, cues);
    const cuesIdx = result.indexOf(cues);
    const promptIdx = result.indexOf('What do you do?');
    expect(cuesIdx).toBeGreaterThan(-1);
    expect(promptIdx).toBeGreaterThan(-1);
    expect(cuesIdx).toBeLessThan(promptIdx);
  });

  it('keeps the cues after the narration and status content (not just anywhere before the prompt)', () => {
    const cues = '  · rain sounds';
    const result = insertCuesBeforePrompt(screen, cues);
    const narrationIdx = result.indexOf('Narration text');
    const locationIdx = result.indexOf('Location: Town');
    const cuesIdx = result.indexOf(cues);
    expect(cuesIdx).toBeGreaterThan(narrationIdx);
    expect(cuesIdx).toBeGreaterThan(locationIdx);
  });

  it('preserves the screen unchanged when there are no cues to insert', () => {
    expect(insertCuesBeforePrompt(screen, '')).toBe(screen);
  });

  it('preserves all original screen content verbatim (no truncation) when cues are inserted', () => {
    const cues = '  · music intensifies';
    const result = insertCuesBeforePrompt(screen, cues);
    for (const line of screen.split('\n')) {
      expect(result).toContain(line);
    }
    expect(result).toContain(cues);
  });

  it('falls back to appending at the end when the prompt marker is not found (e.g. a non-play screen)', () => {
    const noPrompt = 'Some other screen with no prompt marker.';
    const cues = '  · alert sounds';
    const result = insertCuesBeforePrompt(noPrompt, cues);
    expect(result).toBe(`${noPrompt}\n${cues}`);
  });
});

// F-7eb33249: renderSfxLine/renderAmbientLine printed the raw
// voiceSoundboardEffect token straight from the sound bridge with zero
// humanization -- e.g. '  · ambient: white_noise' with the underscore
// intact -- reachable 100% of the time the LLM or a built-in hook selects
// that cue, no variance required.
describe('cue label humanization (F-7eb33249)', () => {
  const SFX_CASES: Array<[token: string, expectedPhrase: string]> = [
    ['chime_notification', 'a notification chime'],
    ['chime_success', 'a success chime'],
    ['chime_error', 'an error chime'],
    ['chime_attention', 'an attention chime'],
    ['click', 'a click'],
    ['pop', 'a light pop'],
    ['whoosh', 'a whoosh'],
    ['warning', 'a warning tone'],
    ['critical', 'a critical alarm'],
    ['info', 'an info tone'],
  ];

  it.each(SFX_CASES)('humanizes sfx token "%s" to "%s"', (token, expectedPhrase) => {
    const text = renderPresentationCues([
      { tool: 'sound_effect', params: { effect: token, intensity: 0.5 } },
    ]);
    expect(text).toContain(expectedPhrase);
    expect(text).not.toContain('_');
  });

  const AMBIENT_CASES: Array<[token: string, expectedPhrase: string]> = [
    ['rain', 'rain'],
    ['white_noise', 'white noise'],
    ['drone', 'a low, tense drone'],
  ];

  it.each(AMBIENT_CASES)('humanizes ambient token "%s" to "%s"', (token, expectedPhrase) => {
    const text = renderPresentationCues([
      { tool: 'sound_effect', params: { effect: token, volume: 0.5 } },
    ]);
    expect(text).toContain(expectedPhrase);
    expect(text).not.toContain('_');
  });

  it('falls through an unrecognized sfx token to the generic delimiter-strip transform', () => {
    const text = renderPresentationCues([
      { tool: 'sound_effect', params: { effect: 'some_future_id', intensity: 0.5 } },
    ]);
    expect(text).toContain('some future id');
    expect(text).not.toContain('_');
  });

  it('strips hyphens too, not only underscores, in the generic fallback', () => {
    const text = renderPresentationCues([
      { tool: 'sound_effect', params: { effect: 'far-off-thunder', volume: 0.5 } },
    ]);
    expect(text).toContain('far off thunder');
    expect(text).not.toContain('-');
  });
});

// F-7eb33249 vocabulary-drift tripwire: guards against a future registry
// entry (or a future LLM-facing sound id) shipping with no curated label,
// silently leaking a raw underscored token to players again.
describe('cue label vocabulary-drift tripwire (F-7eb33249)', () => {
  // F-25e533e4: this probe used to iterate ALL of CORE_SOUND_PACK.entries
  // (music included) through a ternary that only ever built a 'sound_effect'
  // call -- so every domain:'music' entry (music_calm/dread/triumph plus
  // the three combat stings) was routed through renderSfxLine, never
  // renderMusicLine, the function that actually renders it in production.
  // The loop "passed" over music while testing nothing about how music
  // actually renders. Narrowed to sfx/ambient (renderMusicLine gets its own
  // loop below, exercising the real function).
  //
  // Domain-breakdown assertion (not just >0): the old
  // `expect(...length).toBeGreaterThan(0)` sanity check would have stayed
  // green even with every music entry silently mis-routed, because it never
  // asserted a count or a domain split -- exactly how this gap went
  // unnoticed. A future entry added to ANY domain now forces this test (or
  // the parallel music one below) to be updated deliberately instead of
  // silently "passing" through the wrong loop.
  it('every CORE_SOUND_PACK sfx/ambient entry (the real structural source of truth, not app code) humanizes with no underscore reaching the screen', () => {
    const domainCounts: Record<string, number> = {};
    for (const entry of CORE_SOUND_PACK.entries) {
      domainCounts[entry.domain] = (domainCounts[entry.domain] ?? 0) + 1;
    }
    expect(domainCounts).toEqual({ sfx: 10, ambient: 3, music: 6 });

    const sfxAndAmbient = CORE_SOUND_PACK.entries.filter((entry) => entry.domain !== 'music');
    expect(sfxAndAmbient.length).toBeGreaterThan(0);

    for (const entry of sfxAndAmbient) {
      const token = entry.voiceSoundboardEffect;
      const params = entry.domain === 'ambient'
        ? { effect: token, volume: 0.5 }
        : { effect: token, intensity: 0.5 };
      const text = renderPresentationCues([{ tool: 'sound_effect', params }]);
      expect(text, `entry "${entry.id}" (token "${token}") leaked an underscore`).not.toContain('_');
    }
  });

  // F-25e533e4 companion loop: every domain:'music' CORE_SOUND_PACK entry
  // whose id ends "_sting" (the combat-outcome stings COMBAT_STING_MAP
  // targets -- music_victory_sting/music_defeat_sting/music_retreat_sting)
  // is routed through a REAL __music_intent__ call (not 'sound_effect'), so
  // renderMusicLine -- the function that actually renders it in production
  // -- is what this test exercises. Asserts the F-488e6621 fix stays true:
  // each sting entry gets its OWN line, distinct from the generic
  // fallback an unrecognized trackId falls back to.
  it('every CORE_SOUND_PACK combat-sting music entry gets a distinct line via renderMusicLine, not the generic sting fallback', () => {
    const stingEntries = CORE_SOUND_PACK.entries.filter(
      (entry) => entry.domain === 'music' && entry.id.endsWith('_sting'),
    );
    expect(stingEntries.length).toBe(3);

    const fallback = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting', trackId: '__unregistered_track__' } },
    ]);

    const seen = new Set<string>();
    for (const entry of stingEntries) {
      const text = renderPresentationCues([
        { tool: '__music_intent__', params: { action: 'sting', trackId: entry.id } },
      ]);
      expect(text, `music sting entry "${entry.id}" rendered the generic fallback instead of a distinct phrase`).not.toBe(fallback);
      seen.add(text);
    }
    // No two combat outcomes may collapse to the same rendered line.
    expect(seen.size).toBe(stingEntries.length);
  });

  // Red proof (design lock: "prove the probe can FAIL"): a trackId this
  // file's STING_LABELS has no authored phrase for -- e.g. a hypothetical
  // future COMBAT_STING_MAP entry the renderer hasn't been taught yet --
  // must fall through to the pre-existing generic line, proving the probe
  // above is actually discriminating (it would fail this same equality
  // check if renderMusicLine ever regressed to giving every trackId the
  // same text) rather than vacuously passing no matter what renderMusicLine
  // does.
  it('a fabricated/unregistered sting trackId falls through to the generic fallback line, not a fabricated distinct one', () => {
    const text = renderPresentationCues([
      { tool: '__music_intent__', params: { action: 'sting', trackId: 'music_totally_unauthored_sting' } },
    ]);
    expect(text).toContain('a sting of music');
  });

  // Coordinator brief (wave-18/cli-display.md, item 5): parity-check against
  // the LLM-facing id list (narrate-scene.ts's SOUND_EFFECT_IDS, hoisted
  // this wave from what's today an inline prose list at narrate-scene.ts:40)
  // resolved through the SAME registry path (SoundRegistry.get) audio-
  // bridge.ts itself uses, instead of hand-copying that 10-id list into this
  // test file.
  //
  // Isolation discipline: SOUND_EFFECT_IDS does not exist in this worktree
  // yet (narrative-llm's export, same wave). Mocked here with the exact 10
  // ids already live in narrate-scene.ts's NARRATE_SYSTEM prompt text at
  // this worktree's HEAD (the "Available sound effects" line). Proven
  // end-to-end against the real hoisted export at the coordinator's
  // merge-time serial verify.
  it('every id the LLM is told is valid (narrate-scene.ts SOUND_EFFECT_IDS) resolves through the registry to a humanized, underscore-free label', async () => {
    vi.doMock('../prompts/narrate-scene.js', () => ({
      SOUND_EFFECT_IDS: [
        'ui_notification', 'ui_success', 'ui_error', 'ui_attention',
        'ui_click', 'ui_pop', 'ui_whoosh',
        'alert_warning', 'alert_critical', 'alert_info',
      ],
    }));
    vi.resetModules();
    try {
      // SOUND_EFFECT_IDS doesn't exist in narrate-scene.ts's real type yet in
      // this worktree (isolation discipline) -- this local cast documents
      // the pinned contract instead of widening to `any`, mirroring bin.ts's
      // own `/cost` command precedent for the identical situation. Drop the
      // cast once narrative-llm's real export lands.
      const mod = await import('../prompts/narrate-scene.js') as unknown as { SOUND_EFFECT_IDS: string[] };
      const { SOUND_EFFECT_IDS } = mod;
      expect(SOUND_EFFECT_IDS.length).toBeGreaterThan(0);

      const registry = new SoundRegistry();
      registry.load(CORE_SOUND_PACK);

      for (const id of SOUND_EFFECT_IDS) {
        const entry = registry.get(id);
        expect(entry, `narrate-scene.ts offers "${id}" but it is not registered in CORE_SOUND_PACK`).toBeDefined();
        const token = entry!.voiceSoundboardEffect;
        const text = renderPresentationCues([
          { tool: 'sound_effect', params: { effect: token, intensity: 0.5 } },
        ]);
        expect(text, `"${id}" -> "${token}" leaked an underscore`).not.toContain('_');
      }
    } finally {
      vi.doUnmock('../prompts/narrate-scene.js');
      vi.resetModules();
    }
  });
});

/**
 * F-386bb9b2 (wave-6 amend): `call.tool` is a bare `string`, not a closed
 * union, so an unrecognized tool value used to fall through the switch's
 * default branch with zero player-visible feedback and zero diagnostic
 * signal -- the same failure shape that already hit this file twice
 * (F-53ca7db8's 'sting' action, F-08f594de's original ui-effect gap).
 * renderPresentationCues now takes an optional `debugMode` flag (threaded
 * from bin.ts's existing --debug flag) that surfaces anything landing in
 * the default branch, other than the one documented/intentional 'speak'
 * case, as a diagnostic line instead of staying silent.
 */
describe('renderPresentationCues unrecognized-tool diagnostic (F-386bb9b2)', () => {
  it('stays silent for an unrecognized tool when debugMode is off (default), matching prior behavior', () => {
    const calls: McpToolCall[] = [{ tool: 'some_future_tool', params: {} }];
    expect(renderPresentationCues(calls)).toBe('');
    expect(renderPresentationCues(calls, false)).toBe('');
  });

  it('surfaces a diagnostic line for an unrecognized tool when debugMode is on', () => {
    const calls: McpToolCall[] = [{ tool: 'some_future_tool', params: {} }];
    const text = renderPresentationCues(calls, true);
    expect(text).not.toBe('');
    // No raw underscored token reaches the screen, matching this file's
    // existing humanizeToken() rule for sfx/ambient ids.
    expect(text).not.toContain('some_future_tool');
    expect(text).toContain('some future tool');
  });

  it('still stays silent for a "speak" call even when debugMode is on (the one documented, intentional default-branch case)', () => {
    const calls: McpToolCall[] = [{ tool: 'speak', params: { text: 'hi', voice: 'narrator' } }];
    expect(renderPresentationCues(calls, true)).toBe('');
  });

  it('does not affect recognized tools when debugMode is on', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'click', intensity: 0.5 } },
    ];
    const withoutDebug = renderPresentationCues(calls, false);
    const withDebug = renderPresentationCues(calls, true);
    expect(withDebug).toBe(withoutDebug);
  });
});
