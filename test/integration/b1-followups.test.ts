// WO-B1F-6 / WO-B1F-13 (docs/living-world-slice-b1-followups.md, run
// swarm-1788288802-f5a0, wave 11, "tests" domain): the family-playtest
// follow-up proofs. Companion: WO-B1F-14 (this domain's envelope lists the
// criteria the fourth playtest run should add -- nothing to write in test/**
// for that one).
//
// SEQUENCING (ADDENDUM-COMMON honesty floor): this worktree forked AFTER
// wave 10's game-core work (src/game/hostile-turn.ts, the asks ledger,
// LivingWorldTuning.enemyAggression) already landed on main -- verified via
// `grep -rn "runHostileTurn\|combat.damage.applied" src/turn-loop.ts` and
// `grep -n "enemyAggression" src/game/tuning.ts`, both hit for real (not a
// mirror type). WO-B1F-6 is therefore GREEN today by construction: it asks
// this domain's OWN helper (test/helpers/living-world-matrix.ts) to expose
// columns for a mechanism that already exists in src/ on this worktree.
//
// WO-B1F-13's four locks (1 reply-to-speaker, 2 play-mode aliases, 3 bare
// name, 7 help path) belong to game-core's ISOLATED worktree for THIS wave,
// which this worktree cannot see -- verified 2026-09-02 (see each proof's own
// doc comment for the specific grep/probe). Proofs (a)-(c) are therefore
// genuinely RED today, "green expected at merge" per proof. Proof (d) is the
// honesty-floor exception: BOTH named help-path scenarios (a petitioner
// seated in another zone; a petitioner name colliding with the pack's
// "Suspicious Pilgrim") were probed live on this worktree and ALREADY
// resolve correctly -- see (d)'s own doc comment for the mechanism. Reported
// as a finding in this wave's envelope rather than assumed red.

import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import { itemCatalog as fantasyItemCatalog } from '@ai-rpg-engine/starter-fantasy';
import { createHarness } from '../helpers/game-harness.js';
import { allPacks } from '../../src/character/packs.js';
import { makePhase9WorldGenProposal } from '../helpers/world-gen-fixtures.js';
import { runLivingWorldMatrix, type MatrixWorldInput } from '../helpers/living-world-matrix.js';

/** The player's current zone -- every fixture below relocates a stock NPC/hostile into it. */
function playerZoneId(world: WorldState): string {
  return world.entities[world.playerId]!.zoneId!;
}

/** Same documented-storage-key seeding discipline reactive-street.test.ts's own seedAsk uses (design lock 7, WO-B1-4). */
function seedAsk(
  world: WorldState,
  ask: {
    id: string;
    petitionerId: string;
    petitionerName: string;
    petitionerZoneId: string;
  },
): void {
  const raw = world.globals['claude_rpg.asks'];
  const existing = typeof raw === 'string' ? (JSON.parse(raw) as unknown[]) : [];
  existing.push({
    id: ask.id,
    petitioner: { id: ask.petitionerId, name: ask.petitionerName, zoneId: ask.petitionerZoneId },
    kind: 'lend',
    surface: 'Lend a few coin for a sick child.',
    truth: 'genuine',
    stake: 5,
    offeredTick: world.meta.tick,
    status: 'open',
    cues: [],
  });
  world.globals['claude_rpg.asks'] = JSON.stringify(existing);
}

/** Seats a bare-minimum petitioner NPC entity directly (design doc §4: the world tick's own seating step does this for real; probing the help resolution independent of the seating mechanism). */
function seatPetitioner(world: WorldState, id: string, name: string, zoneId: string): void {
  world.entities[id] = {
    id,
    blueprintId: 'petitioner',
    type: 'npc',
    name,
    tags: ['npc', 'named', 'petitioner'],
    stats: {},
    resources: {},
    statuses: [],
    zoneId,
  } as unknown as WorldState['entities'][string];
}

describe('WO-B1F-6 -- downed metric + telegraphed profile (design doc lock 6)', () => {
  const WORLDS: MatrixWorldInput[] = [
    ...allPacks.map((pack) => ({ kind: 'pack' as const, label: pack.meta.id, pack })),
    {
      kind: 'generated' as const,
      label: 'generated-phase9-fixture',
      proposal: makePhase9WorldGenProposal(),
      itemCatalog: fantasyItemCatalog,
      seedFactionPressure: { factionId: 'guard', reputation: -60, alertLevel: 70 },
    },
  ];

  it(
    "the matrix's own 'off' default leaves playerDowned null and enemyHitsTaken 0 for every world " +
      "(regression pin, wave-10 ruling: runHostileTurn's own early return at enemyAggression 'off' means no " +
      'combat.damage.applied event against the player can exist)',
    async () => {
      const { sheet } = await runLivingWorldMatrix(WORLDS);
      for (const row of sheet.rows) {
        expect(row.playerDowned, `${row.label}: playerDowned must stay null at the matrix default`).toBeNull();
        expect(row.enemyHitsTaken, `${row.label}: enemyHitsTaken must stay 0 at the matrix default`).toBe(0);
      }
    },
    60_000,
  );

  it(
    "LIVING_WORLD_TUNING_JSON='{\"enemyAggression\":\"telegraphed\"}' populates both new columns across the " +
      'matrix (measured live 2026-09-02: 12 of the 13 worlds down the scripted walker within the 30-round window, ' +
      "and every world lands at least one hit -- the exact evidence buildHarnessForWorld's own doc comment cites " +
      '("19 reds at defaults, 4 with aggression off") for why the composed proof pins aggression off by default).',
    async () => {
      const previous = process.env.LIVING_WORLD_TUNING_JSON;
      process.env.LIVING_WORLD_TUNING_JSON = '{"enemyAggression":"telegraphed"}';
      try {
        const { sheet } = await runLivingWorldMatrix(WORLDS);
        const downedCount = sheet.rows.filter((r) => r.playerDowned !== null).length;
        expect(
          downedCount,
          'at least 10 of the 13 worlds should down the scripted walker within 30 rounds once the hostile turn is switched on',
        ).toBeGreaterThanOrEqual(10);
        for (const row of sheet.rows) {
          expect(row.enemyHitsTaken, `${row.label}: enemyHitsTaken should be > 0 once aggression is telegraphed`).toBeGreaterThan(0);
        }
      } finally {
        if (previous === undefined) delete process.env.LIVING_WORLD_TUNING_JSON;
        else process.env.LIVING_WORLD_TUNING_JSON = previous;
      }
    },
    60_000,
  );

  it(
    "opts.tuning overrides the 'off' default the same way the env var does (buildHarnessForWorld's own spread, " +
      "`{ enemyAggression: 'off', ...(tuningIn ?? {}) }`, lets a caller-supplied enemyAggression win) -- single-world " +
      'scope, so this stays fast without needing the env var plumbing at all',
    async () => {
      const chapelThreshold = allPacks.find((p) => p.meta.id === 'chapel-threshold');
      expect(chapelThreshold, 'baseline: the starter-fantasy pack must be registered').toBeDefined();
      const { sheet } = await runLivingWorldMatrix(
        [{ kind: 'pack', label: 'chapel-threshold', pack: chapelThreshold! }],
        { tuning: { enemyAggression: 'telegraphed' } },
      );
      expect(sheet.rows).toHaveLength(1);
      expect(sheet.rows[0]!.enemyHitsTaken, 'the caller override must actually switch the hostile turn on').toBeGreaterThan(0);
    },
    30_000,
  );
});

describe('WO-B1F-13 -- follow-up proofs (design doc locks 1, 2, 3, 7)', () => {
  it(
    '(a) a free-prose reply the turn after an NPC spoke resolves as dialogue to that NPC, not a clarification ' +
      'request (design lock 1, WO-B1F-1 game-core) -- OBSERVED RED, verified 2026-09-02: after "speak to pilgrim" ' +
      "records an exchange under session.npcConversations.get('pilgrim'), a free-prose reply with no recognized " +
      'verb ("The dead do not stay buried.") still misses every fast-path branch and falls to the slow (LLM) path, ' +
      'which the fake client fails, rendering "I\'m not sure what you mean. The world feels hazy for a moment... ' +
      '(interpretation service unavailable — try again)" instead of resolving as speak to the NPC who just spoke. ' +
      "`recordConversationExchange` (game.ts) already exists and keys the map by npcId; nothing reads it before " +
      'the LLM path runs. Green expected once game-core lands the reply-to-speaker fast path.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['pilgrim']!.zoneId = playerZoneId(world);

      await h.play('speak to pilgrim');
      expect(h.session.npcConversations.has('pilgrim'), 'baseline: the exchange must actually be recorded').toBe(true);
      const exchangesBefore = h.session.npcConversations.get('pilgrim')!.length;

      const out = await h.play('The dead do not stay buried.');

      expect(
        out,
        'a reply to the NPC who just spoke must not be met with a clarification request',
      ).not.toContain("I'm not sure what you mean");
      const exchangesAfter = h.session.npcConversations.get('pilgrim')?.length ?? 0;
      expect(
        exchangesAfter,
        'the free-prose reply should extend the SAME npcConversations exchange, not vanish into a clarification',
      ).toBeGreaterThan(exchangesBefore);
    },
  );

  it(
    '(b) "/go <exit>" resolves as the move verb in play mode (design lock 2, WO-B1F-2 game-core + cli-display) -- ' +
      'OBSERVED RED, verified 2026-09-02: play mode\'s slash-command dispatch has no /go|/move|/zone case, so ' +
      '"/go chapel-nave" renders "Unknown command /go. Right now you can: /help · /status · /leverage" and the ' +
      'player never leaves chapel-entrance. Green expected at merge.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      expect(playerZoneId(world), 'baseline').toBe('chapel-entrance');

      const out = await h.play('/go chapel-nave');

      expect(out.toLowerCase(), 'the alias should move the player, not report an unknown command').not.toContain('unknown command');
      expect(playerZoneId(world), 'the player should have moved to chapel-nave').toBe('chapel-nave');
    },
  );

  it(
    '(b) "/rumors" is readable from play mode instead of redirecting to director mode (design lock 2) -- ' +
      'OBSERVED RED, verified 2026-09-02: play mode\'s near-miss reply for /rumors names the director-mode family ' +
      'instead of rendering the rumor view: "Unknown command /rumors. Did you mean /rumors? /rumors lives in ' +
      'director mode — type /director." Green expected at merge.',
    async () => {
      const h = createHarness();
      const out = await h.play('/rumors');
      expect(
        out.toLowerCase(),
        'play-mode /rumors should render the rumor view directly, not point at director mode',
      ).not.toContain('lives in director mode');
    },
  );

  it(
    '(c) a bare named-entity input resolves as speak to it (design lock 3, WO-B1F-3 game-core) -- OBSERVED RED, ' +
      'verified 2026-09-02: "Suspicious Pilgrim" typed alone with no verb misses every fast-path branch and falls ' +
      'to the LLM path, rendering "I\'m not sure what you mean. The world feels hazy for a moment... (interpretation ' +
      'service unavailable — try again)" instead of speaking to the pilgrim. Green expected at merge.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['pilgrim']!.zoneId = playerZoneId(world);

      const out = await h.play('Suspicious Pilgrim');

      expect(out).not.toContain("I'm not sure what you mean");
      expect(h.session.npcConversations.has('pilgrim'), 'a bare entity name should resolve as speak to that entity').toBe(true);
    },
  );

  it(
    "(d1) help <name> resolves for a petitioner seated in ANOTHER zone -- HONESTY FLOOR: OBSERVED GREEN today " +
      "(probed live 2026-09-02, contra the design doc's own framing of item 7 as broken), so this is a regression " +
      "pin, not a red-first proof. Mechanism: findEntityByName(targetName, zone-scoped entities) misses (the " +
      "petitioner isn't in the player's zone), so action-interpreter.ts's help branch falls to its own byName " +
      "fallback (matching getOpenAsks(world) by petitioner name, unscoped by zone) and resolves 'speak' against " +
      "the petitioner's real entity id wherever it actually sits. Reported as a finding in this wave's envelope: " +
      "the two run-b transcripts that failed to resolve 'help <petitioner>' (design doc item 7) are not reproduced " +
      "by this scenario -- the actual cause is something this synthetic fixture does not capture (the real world- " +
      "tick seating step, ask expiry timing, or a name variant this probe did not try).",
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      const zoneId = playerZoneId(world);
      const otherZoneId = Object.keys(world.zones).find((z) => z !== zoneId)!;
      expect(otherZoneId, 'baseline: the pack must have more than one zone').toBeDefined();

      seedAsk(world, { id: 'ask-b1f-d1', petitionerId: 'petitioner-b1f-d1', petitionerName: 'A Courier', petitionerZoneId: otherZoneId });
      seatPetitioner(world, 'petitioner-b1f-d1', 'A Courier', otherZoneId);

      const out = await h.play('help courier');

      expect(out.toLowerCase(), 'help should resolve the ask even though the petitioner is in another zone').not.toContain('not sure what you mean');
      expect(h.session.npcConversations.has('petitioner-b1f-d1'), 'the help commitment should resolve as speak to the petitioner').toBe(true);
    },
  );

  it(
    '(d2) help <name> resolves for a petitioner whose name shares a word with the pack\'s "Suspicious Pilgrim" in ' +
      'the same zone -- HONESTY FLOOR: OBSERVED GREEN today (probed live 2026-09-02, both with the shorter "help ' +
      'pilgrim" and the full "help pilgrim vendor", and with the petitioner entity inserted before or after the ' +
      "pack's own pilgrim). Mechanism: even when findEntityByName's substring match resolves the AMBIGUOUS shared " +
      "word to the wrong entity first (the pack's own \"Suspicious Pilgrim\", which carries no open ask), that " +
      "branch's own `if (ask)` guard falls through since findOpenAskForEntity returns nothing for it, and the " +
      "byName fallback's reverse-includes check (`name.includes(targetName)`) still matches \"Pilgrim Vendor\" " +
      "against the shorter \"pilgrim\" query. Reported as a finding in this wave's envelope for the same reason as " +
      "(d1): worth a regression pin regardless, since a future change to findEntityByName's ordering or the byName " +
      'fallback could silently break this collision case.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      const zoneId = playerZoneId(world);
      world.entities['pilgrim']!.zoneId = zoneId; // the pack's own "Suspicious Pilgrim", no ask of its own

      seedAsk(world, { id: 'ask-b1f-d2', petitionerId: 'petitioner-b1f-d2', petitionerName: 'Pilgrim Vendor', petitionerZoneId: zoneId });
      seatPetitioner(world, 'petitioner-b1f-d2', 'Pilgrim Vendor', zoneId);

      const out = await h.play('help pilgrim');

      expect(out.toLowerCase(), 'help should resolve to the petitioner with the open ask, not the unrelated pack NPC').not.toContain('not sure what you mean');
      expect(h.session.npcConversations.has('petitioner-b1f-d2'), 'the help commitment should resolve to the petitioner, not "Suspicious Pilgrim"').toBe(true);
      expect(h.session.npcConversations.has('pilgrim'), 'the unrelated pack NPC must not be the one who receives the help commitment').toBe(false);
    },
  );
});
