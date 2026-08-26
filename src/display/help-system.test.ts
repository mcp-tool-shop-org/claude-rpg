import { describe, it, expect, afterEach } from 'vitest';
import { renderConcludeHelp, renderArcHelp, renderPlayHelp, getPackOnboarding, getOnboardingByGenre, getOnboardingForSession, renderFirstTurnOrientation, ARC_KIND_HELP, ARC_MOMENTUM_HELP, PACK_ONBOARDING, GENRE_TO_PACK, wrapWords, renderNameDescriptionRow } from './help-system.js';
import { RESOLUTION_CLASS_LABELS } from './archive-browser.js';
import { PLAY_COMMANDS } from '../cli/slash-completer.js';
import { allPacks } from '../character/packs.js';

/**
 * F-545cb684: renderConcludeHelp's '/help conclude' prose used to hand-list
 * 8 resolution classes (victory, exile, overthrow, martyrdom, corruption,
 * revelation, stalemate, exodus) that did not match the 8 classes
 * archive-browser.ts's getResolutionLabel actually renders for completed
 * campaigns (collapse, puppet-master, quiet-retirement, tragic-stabilization
 * replace 4 of the stale ones). Verified against the real engine enum
 * (@ai-rpg-engine/modules ResolutionClass, endgame-detection.d.ts) — the
 * archive-browser.ts set is the current one. This test checks
 * renderConcludeHelp's own output against RESOLUTION_CLASS_LABELS (the same
 * source, now exported from archive-browser.ts) so the two can't diverge
 * again without a compile error and a test failure.
 */
describe('renderConcludeHelp', () => {
  it('documents every resolution class the engine actually produces', () => {
    const text = renderConcludeHelp();
    for (const resolutionClass of Object.keys(RESOLUTION_CLASS_LABELS)) {
      expect(text).toContain(resolutionClass);
    }
  });

  it('does not document resolution classes the engine no longer produces', () => {
    const text = renderConcludeHelp();
    // Stale prose from before the resolution-class enum was redesigned.
    for (const stale of ['corruption', 'stalemate', 'exodus']) {
      expect(text).not.toContain(stale);
    }
    // 'revelation' is asserted absent here too. An earlier version of this
    // comment claimed it was "(coincidentally) a real ArcKind used by...
    // renderArcHelp()" — that was false (F-204465a3): 'revelation' has never
    // been a member of @ai-rpg-engine/modules' ArcKind, and renderArcHelp's
    // own reconciliation test below confirms it doesn't appear there either
    // now that that list is derived from the real enum too.
    expect(text).not.toContain('revelation');
  });

  it('still introduces the list as "8 resolution classes"', () => {
    const text = renderConcludeHelp();
    expect(text).toContain('8 resolution classes');
  });
});

/**
 * F-204465a3: renderArcHelp()'s '/help arcs' prose used to hand-list 10
 * "narrative arc kinds" (rising-power, hunted, kingmaker, resistance,
 * merchant-prince, shadow-broker, peacemaker, outcast, revelation, betrayer)
 * that did not match the real ArcKind union (@ai-rpg-engine/modules,
 * arc-detection.d.ts): 4 of those names have never existed
 * (peacemaker/outcast/revelation/betrayer), while 4 real kinds
 * (last-stand/community-builder/descent/reckoning) went undocumented. The
 * adjacent momentum line ("rising, steady, or fading") had the identical
 * problem against the real ArcMomentum type — only 'steady' matched; the
 * real values are building/steady/waning. Same fix as renderConcludeHelp's
 * F-545cb684 above: both lists are now derived from ARC_KIND_HELP /
 * ARC_MOMENTUM_HELP maps typed against the real engine enums (exported from
 * help-system.ts), so this test checks renderArcHelp's own output against
 * those maps — the two can't diverge again without a compile error and a
 * test failure.
 */
describe('renderArcHelp', () => {
  it('documents every arc kind the engine actually produces', () => {
    const text = renderArcHelp();
    for (const kind of Object.keys(ARC_KIND_HELP)) {
      expect(text).toContain(kind);
    }
  });

  it('does not document arc kinds the engine has never produced', () => {
    const text = renderArcHelp();
    // Stale prose from before this list was typed against the real enum.
    for (const stale of ['peacemaker', 'outcast', 'revelation', 'betrayer']) {
      expect(text).not.toContain(stale);
    }
  });

  it('documents every real momentum value', () => {
    const text = renderArcHelp();
    for (const momentum of Object.keys(ARC_MOMENTUM_HELP)) {
      expect(text).toContain(momentum);
    }
  });

  it('does not use the stale momentum wording ("rising, steady, or fading")', () => {
    const text = renderArcHelp();
    // Word-level 'rising'/'fading' checks would false-positive against the
    // real 'rising-power' kind, so this checks the whole stale phrase.
    expect(text).not.toContain('rising, steady, or fading');
  });

  it('still introduces the list as "10 narrative arc kinds"', () => {
    const text = renderArcHelp();
    expect(text).toContain('10 narrative arc kinds');
  });
});

/**
 * F-6c9e02d4: PACK_ONBOARDING and GENRE_TO_PACK both hand-duplicate the
 * pack id set that packs.ts's allPacks array is the real source of truth
 * for -- currently identical (7 of 7), but nothing enforced that. The
 * still-open F-00ddfc68 (allPacks itself lags 3 installed-but-unregistered
 * starter packages) means allPacks WILL gain entries later; when it does,
 * these two in-repo maps must be forced to keep up rather than silently
 * drifting from allPacks (and each other) the way ARC_KIND_HELP and
 * RESOLUTION_CLASS_LABELS were once allowed to drift from their real
 * engine enums (F-204465a3, F-545cb684). This is a minimum floor, not a
 * fix for F-00ddfc68's own gap: a future allPacks addition still needs a
 * PACK_ONBOARDING entry (and, per F-6c9e02d4's fix note, may need
 * GENRE_TO_PACK's Record<string,string> shape rethought if two new packs
 * share a genre) -- this test only guarantees the addition can't be
 * forgotten silently.
 */
describe('PACK_ONBOARDING / GENRE_TO_PACK drift guard (F-6c9e02d4)', () => {
  const registeredPackIds = allPacks.map((p) => p.meta.id).sort();

  it('PACK_ONBOARDING has exactly one entry per pack registered in packs.ts allPacks', () => {
    expect(Object.keys(PACK_ONBOARDING).sort()).toEqual(registeredPackIds);
  });

  it('GENRE_TO_PACK points only at pack ids registered in packs.ts allPacks, with none missing', () => {
    expect(Object.values(GENRE_TO_PACK).sort()).toEqual(registeredPackIds);
  });
});

// F-38eb3dec: help-system.ts's DIVIDER/THIN were both a fixed 60-char
// string, unlike play-renderer.ts's own dividers (PFE-005), which adapt to
// the real terminal width. Mirrors play-renderer-divider.test.ts's
// assertions. renderPlayHelp exercises DIVIDER; renderFirstTurnOrientation
// (via a real PACK_ONBOARDING entry) exercises THIN.
describe('help-system divider width (F-38eb3dec)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('renderPlayHelp divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const help = renderPlayHelp();
    expect(help).toContain('─'.repeat(40));
    expect(help).not.toContain('─'.repeat(60));
  });

  it('renderPlayHelp divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const help = renderPlayHelp();
    expect(help).toContain('─'.repeat(120));
    expect(help).not.toContain('─'.repeat(121));
  });

  it('renderFirstTurnOrientation thin divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const onboarding = getPackOnboarding('chapel-threshold');
    expect(onboarding).toBeDefined();
    const output = renderFirstTurnOrientation(onboarding!);
    expect(output).toContain('·'.repeat(40));
    expect(output).not.toContain('·'.repeat(60));
  });
});

/**
 * F-1036ff43: renderPlayHelp()'s COMMANDS section hand-listed only 5 of 12+
 * real play-mode slash commands, omitting /map, /leverage, /jobs, /export,
 * /archive, /character (plus /recruit/​/dismiss, filed separately as
 * F-ffc12b36). Fixed by deriving the COMMANDS list from PLAY_COMMANDS
 * (slash-completer.ts) — the same table SLASH_COMMANDS itself derives from
 * — so the two surfaces can't drift again. '/help' itself is documented
 * separately via its four hand-typed subcommand rows just above.
 */
describe('renderPlayHelp COMMANDS section (F-1036ff43)', () => {
  it('documents every PLAY_COMMANDS entry', () => {
    const help = renderPlayHelp();
    for (const { cmd } of PLAY_COMMANDS) {
      expect(help, `expected renderPlayHelp() to mention ${cmd}`).toContain(cmd);
    }
  });

  it('still documents the four /help subcommand forms', () => {
    const help = renderPlayHelp();
    expect(help).toContain('/help leverage');
    expect(help).toContain('/help arcs');
    expect(help).toContain('/help conclude');
    expect(help).toContain('/help <pack-id>');
  });
});

/**
 * F-d66603e9: renderArcHelp()/renderConcludeHelp() built their two-column
 * tables with a fixed name.padEnd(N) plus an unbounded description on the
 * same line. The surrounding dividers already adapt to getTerminalWidth()
 * (clamped 40-120, F-38eb3dec), but the rows between them didn't — at a
 * narrow terminal, a long description wrapped wherever the terminal broke
 * it, flush against the left margin, indistinguishable from the next
 * entry's name.
 */
describe('wrapWords / renderNameDescriptionRow (F-d66603e9)', () => {
  it('wrapWords keeps text that already fits on one line', () => {
    expect(wrapWords('short text', 40)).toEqual(['short text']);
  });

  it('wrapWords breaks a long sentence into width-bounded lines without splitting words or losing text', () => {
    const sentence = 'Mounting obligations and converging pressures forcing a confrontation';
    const lines = wrapWords(sentence, 16);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(16);
    }
    expect(lines.join(' ')).toBe(sentence);
  });

  it('renderNameDescriptionRow hanging-indents a wrapped continuation under the name column instead of flush left', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const row = renderNameDescriptionRow(
      'reckoning',
      'Mounting obligations and converging pressures forcing a confrontation',
      20,
    );
    const lines = row.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].startsWith('    reckoning')).toBe(true);
    for (let i = 1; i < lines.length; i++) {
      // 4-space indent + 20-wide name column = 24 spaces of hanging indent.
      expect(lines[i].startsWith(' '.repeat(24))).toBe(true);
      expect(lines[i].trim().length).toBeGreaterThan(0);
    }
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });
});

describe('renderArcHelp / renderConcludeHelp description wrapping (F-d66603e9)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('renderArcHelp wraps the reckoning row with a hanging indent at a narrow terminal instead of running past the edge', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const lines = renderArcHelp().split('\n');
    const startIdx = lines.findIndex((l) => l.includes('reckoning'));
    expect(startIdx).toBeGreaterThan(-1);
    expect(lines[startIdx].length).toBeLessThanOrEqual(40);
    expect(lines[startIdx + 1].startsWith(' '.repeat(24))).toBe(true);
    expect(lines[startIdx + 1].length).toBeLessThanOrEqual(40);
  });

  it('renderConcludeHelp wraps a long resolution-class row instead of running past the edge at a narrow terminal', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const lines = renderConcludeHelp().split('\n');
    const startIdx = lines.findIndex((l) => l.includes('tragic-stabilization'));
    expect(startIdx).toBeGreaterThan(-1);
    expect(lines[startIdx].length).toBeLessThanOrEqual(40);
  });

  it('renderArcHelp still fits a short-enough description on one line at a wide terminal (no unnecessary wrapping)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const text = renderArcHelp();
    expect(text).toContain(
      'reckoning'.padEnd(20) + 'Mounting obligations and converging pressures forcing a confrontation',
    );
  });
});

/**
 * F-ed5f7d25: getOnboardingByGenre() looked up GENRE_TO_PACK by
 * pack.meta.genres[0], a lossy independent taxonomy — only 3 of 10
 * registered packs had a genres[0] matching their GENRE_TO_PACK key, and two
 * pairs collide on the same genres[0] string, so genre alone can never
 * disambiguate every pack. getOnboardingForSession fixes this by preferring
 * the real pack id (PACK_ONBOARDING is keyed directly by packId, so this
 * path is correct for all 10 packs by construction) and only falling back to
 * the lossy genre lookup when no packId is available (e.g. a custom
 * `claude-rpg new "<prompt>"` world).
 *
 * NOTE: the only production call site (src/game/game-presenter.ts's
 * renderOpeningOutput) is outside cli-display's owned globs and still calls
 * getOnboardingByGenre(genre) directly — wiring the real call site to this
 * function is a cross-domain remainder for game-core (see wave-14 output).
 */
describe('getOnboardingForSession (F-ed5f7d25)', () => {
  it('resolves an onboarding card by real pack id for every registered pack, even where genres[0] collides or mismatches GENRE_TO_PACK', () => {
    for (const pack of allPacks) {
      const onboarding = getOnboardingForSession(pack.meta.id, pack.meta.genres[0] ?? 'fantasy');
      expect(onboarding, `expected an onboarding card for pack "${pack.meta.id}"`).toBeDefined();
    }
  });

  it('falls back to the genre-based lookup when no packId is available (e.g. a custom-generated world)', () => {
    expect(getOnboardingForSession(undefined, 'fantasy')).toBe(getOnboardingByGenre('fantasy'));
    expect(getOnboardingForSession('not-a-real-pack-id', 'cyberpunk')).toBe(getOnboardingByGenre('cyberpunk'));
  });

  it('prefers packId over genre even when genre would resolve to a different pack', () => {
    // gaslight-detective's genres[0] is 'mystery' (not in GENRE_TO_PACK at
    // all), so the pre-fix lookup produced undefined for this pack.
    const onboarding = getOnboardingForSession('gaslight-detective', 'mystery');
    expect(onboarding).toBe(getPackOnboarding('gaslight-detective'));
  });
});
