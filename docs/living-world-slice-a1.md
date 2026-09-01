# Slice A1 — module-family parity for generated worlds (+ the R4 recruit contract)

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Rulings this slice executes:** R2 (full world-source parity in A1, generated
quests stop being decorative) and R4 (the engine's three-location faction
model). Ruling record: `E:/AI/testing-os/swarms/swarm-1788288802-f5a0/RULINGS-A-cycle.md`.
**Grounding:** wave-1 inventories F-a16221b5 (parity delta), F-27f12f16
(quests / encounter content shapes), F-f1484a5e (recruit membership seam),
and the wave-3 record F-91c2a4e7 (generated quests decorative).

## Why this slice exists

Pack worlds boot through the engine's `buildWorldStack`, which registers the
whole strategic family (district-core fed, economy-core, trade-core,
companion-core, npc-agency, faction-agency, player-leverage, crafting,
opportunity-core, belief-provenance, observer-presentation, defeat-fallout,
world-tick, and — when configured — encounter-spawn and quests). Generated
worlds construct a hand list at `src/foundry/world-gen.ts` with none of the
strategic family and a district-core fed no districts. Slice A2 makes
`runWorldTick` the per-round driver; a driver over an empty strategic family
is the half-adoption this cycle exists to kill. A1 makes both world sources
the same world before the driver turns on.

## Design (locked)

### 1. `buildWorldStack` replaces the strategic tail of the generated-world module list

`generateWorld()` builds a `WorldStackConfig` from the proposal and spreads
`buildWorldStack(config).modules` into the Engine's `modules` array in place
of the modules the stack itself registers. The hand list keeps ONLY what the
stack does not register: `traversalCore`, `statusCore`, `combatCore`,
`createCognitionCore(...)`, `createPerceptionFilter()`,
`createSimulationInspector()` — in that order, AHEAD of the stack's modules
(the stack's own prerequisite contract: cognition-core and perception-filter
precede the world tier). Every module the stack registers is REMOVED from the
hand list (environment-core, faction-cognition, rumor-propagation,
district-core, belief-provenance, observer-presentation); a double
registration throws at construction and the parity sentinel (§5) must prove
that.

`WorldStackConfig` derivation:

| field | source |
|---|---|
| `playerId` | `'player'` (the entity id world-gen already assigns) |
| `factions` | `proposal.factions` → `{ factionId, entityIds: memberIds, cohesion: 0.7 }` — the SAME array reference the F-105a5718 remap reconciliation mutates after NPC id collisions resolve (keep that mechanism; it is what makes the roster true) |
| `environment` | today's hazards config, unchanged |
| `rumors` | `{ propagationDelay: 2 }` (today's value) |
| `districts` | §2 |
| `presentationRules` | `[]` (today's value) |
| `economyGenre` / `tradeGenre` / `craftingGenre` | `proposal.genre` when present and valid (§2); otherwise undefined (engine defaults) |
| `encounterSpawn` | §2 — present only when the proposal authors encounters |
| `quests` | §3 |
| `defeatFallout` | omitted (the stack derives it from `factions` + `playerId`) |

`buildWorldStack` returns `{ modules, warnings }`; warnings are surfaced
through the existing `logger?.warn('world-gen', …)` channel (never thrown,
never printed raw to the player).

`world.meta.gameId` must equal the `gameId` passed to `encounterSpawn` and
`quests` — both registries key on it. Use the manifest id world-gen already
derives from the title.

### 2. Proposal extension — three new optional fields

`WorldGenProposal` gains, all optional so every existing fixture and every
LLM response that omits them stays valid:

```ts
genre?: string;              // one of the engine's genre keys (see below)
districts?: Array<{
  id: string;                // kebab-case
  name: string;
  zoneIds: string[];         // every id must name a proposal zone
  tags: string[];
  controllingFaction?: string; // must name a proposal faction when present
}>;
encounters?: Array<{
  id: string;                // kebab-case
  name: string;
  zoneIds: string[];         // zones whose entry may spawn it
  hostiles: Array<{ npcId: string; count?: number }>; // npcId names a proposal NPC of type 'enemy'; count defaults to 1
}>;
```

- **genre** validates against the engine's known keys: the union of
  `GENRE_SUPPLY_DEFAULTS` keys (economy-core.ts) and the pressure-system
  genre switch (pressure-system.ts). Resolve the exact list from the
  installed 3.11 dist at implementation time and pin it in a test that reads
  the engine, not a hand copy. An unknown value is dropped with a
  `logger?.warn`, never a validation error (the world still boots on engine
  defaults).
- **districts** → `DistrictDefinition[]` 1:1 (`baseMetrics` omitted). When
  the proposal omits districts, **derive one district per zone**
  (`id = zone.id`, `name = zone.name`, `zoneIds = [zone.id]`,
  `tags = zone.tags`, `controllingFaction` = the faction with the most
  members placed in that zone, if any) so the economy/mood/safety systems
  have a district to move — a generated world without districts is the
  dead district-core this slice retires. Validation: unknown zoneIds and
  unknown controllingFaction are dropped with a warn; a district left with
  zero zones is dropped.
- **encounters** → `EncounterSpawnContent`: each hostile `npcId` becomes an
  `entityTemplates` entry cloned from that NPC's proposal shape (stats,
  resources, tags + `'hostile'`, `type: 'enemy'`), each encounter becomes
  an `encounters` definition with `count` repetitions of the template, and
  `zoneTables` maps each listed zoneId to the encounter ids (repetition =
  weight; list once). Follow the shape encounter-spawn.ts:120-135 documents
  and mirror how starter-fantasy's `encounterSpawnContent` authors it.
  Present only when at least one valid encounter survives validation.
- The world-gen PROMPT (`src/prompts/world-gen.ts` `WORLDGEN_SYSTEM`) gains
  the three fields in its JSON structure block and three rules: pick
  `genre` from the listed keys; author 2–4 districts grouping adjacent
  zones with a controlling faction where one dominates; author 1–3
  encounters using `type: "enemy"` NPCs. Prompt copy is a player-invisible
  system prompt but is still coordinator-reviewed at stitch.

### 3. Quests reach the engine

`proposal.quests` → `QuestDefinition[]`:

- `stages[i].name` = the proposal stage's `description` truncated to a title
  (first clause, ≤ 60 chars) when no name is present; `description` kept
  whole; `objectives` = `[description]`.
- **One synthesized quest-level offer trigger per quest** (corrected at the
  wave-3 stitch — the engine's runtime validation rejects a quest with no
  offer trigger, so the original "no triggers" wording would have dropped
  every generated quest): `world.zone.entered` with a `payload-equals`
  condition on the player's `startZoneId` and the `offer` effect — the
  shape starter-fantasy's authored quests use. The fresh-boot zone-entry
  event (slice-adjacent, wave 2) fires it the moment the world opens. No
  stage triggers, rewards, or failConditions this slice (a stage with no
  advance trigger is offered and waits; A5 deepens generated quests).
- `createQuestCore` is fail-loud by contract and runs BOTH
  `validateQuestDefinition` and `validateQuestRuntimeContent`. Validate each
  mapped quest with both first; a quest that fails is dropped with a
  `logger?.warn` naming the quest id and the first problem, and the world
  still boots. Never let one bad LLM quest kill world creation.
- `WorldGenResult.quests` keeps returning the proposal shape (callers
  consume it today); its stale "when the engine supports it" TODO is
  rewritten to describe the real wiring.

### 4. R4 — the recruit/dismiss contract

`src/companion/companion-bridge.ts`:

- **recruit:** capture `originFaction = entity.faction` (when a non-empty
  string) BEFORE the party-faction overwrite and store it on the
  `CompanionState` the app builds (`originFaction`, the 3.11 field). After
  the overwrite, call the installed dist's
  `updateLivingFactionMembership(world, entity.id, partyFaction)` so the
  membership registry follows the living identity for non-explicit slots
  (an authored explicit membership stays sticky — that is the engine's
  contract, do not fight it).
- **dismiss:** restore `entity.faction = companion.originFaction` when
  present (delete the field when the companion had none), and call
  `updateLivingFactionMembership(world, npcId, originFaction)` when present.
- The wave-2 descriptive pins (companion-bridge.test.ts:317+) become
  CONTRACT pins: the loyalty/allied values are asserted as the designed
  outcome of membership following the party; the dismiss test asserts
  origin restoration instead of lossiness (invert the pin, red first).

### 5. Proofs

- **Parity sentinel** (test/integration): construct a generated world from
  a fixture proposal (world-gen.test.ts's `makeValidProposal` pattern with
  a fake client) and a pack world (`createGame()` from starter-fantasy);
  assert the set of registered strategic module ids is identical between
  the two (derive both sets from the engine, subtract the pack's
  content-only modules by an explicit allowlist that the test documents).
- **Collision sentinels still hold**: the engine-composition sentinel (and
  `registerLeverageVerbs`' `{override:true}` on `sabotage`/`craft` in
  game.ts) applies to generated worlds now that player-leverage and
  crafting register their verbs there — prove a GameSession over a
  generated world boots and lists the same verb catalog as a pack world.
- **Behavior delta #1 — defeat-fallout accrues in generated worlds:** a
  real kill in a fixture generated world writes `player_heat` (+5) and the
  victim faction's `reputation_<id>` into `world.globals`. Pin it; this is
  the first living-world signal a generated world has ever recorded.
- **Quests reach engine state:** after construction, the quest registry
  for `world.meta.gameId` holds the mapped quests; a quest that fails
  validation is dropped with a warning and the world still boots.
- **Districts derived:** a proposal without districts yields one district
  per zone; a proposal with districts yields exactly those (unknown zone
  ids dropped with a warning).
- **Floor:** serial verify 3× byte-identical after merge; no scripted
  session pin may be re-derived without a consequence proof (the tick is
  NOT called yet — the event stream should not shift in this slice except
  for defeat-fallout's own writes, which emit no events).

## Out of scope (later slices)

`runWorldTick` placement (A2), the six-store migration (A3), read-back
rewires (A4), player surfaces for the five systems and RumorEngine (A5),
tuning (A6), the verb surface (R6: stays suppressed).

## Ownership for the execute wave

- **runtime-foundry:** world-gen.ts (§1–§3 mapping + validation + tests in
  world-gen.test.ts), companion-bridge.ts (§4 + pins).
- **narrative-llm:** the WORLDGEN_SYSTEM prompt extension (§2) + its tests.
- **game-core:** the generated-world GameSession boot proof + verb catalog
  parity + defeat-fallout accrual pin (game.test.ts / turn-loop.test.ts).
- **tests:** the parity sentinel + quest-wiring proof (test/integration).
- **cli-display, ci-tooling:** honest-empty with tripwire sweeps.
- **docs (coordinator):** this document; README/CHANGELOG at Phase 10.
