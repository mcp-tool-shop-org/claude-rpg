// Core turn loop: input → interpret → resolve → narrate → present
// v0.2: integrated with ImmersionRuntime for multi-modal output
// v0.7: pressure resolution detection heuristic

import type { Engine, ResolvedEvent, WorldState, EntityState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';
import { getEntityFaction, getCognition, type PlayerRumor, type WorldPressure, type ResolutionType, type NpcActionResult } from '@ai-rpg-engine/modules';
import type { ClaudeClient, StreamCallback } from './claude-client.js';
import { interpretAction, type InterpretedAction } from './action-interpreter.js';
import { narrateScene, FATAL_NARRATION_FALLBACK, type NarrationResult } from './narrator/narrator.js';
import { generateDialogue, type DialogueResult } from './dialogue/dialogue-mind.js';
import type { ConversationExchange } from './prompts/dialogue-npc.js';
// F-6e75fa93 (SLATE-1, ruled 2026-08-26): narrative-llm extracts NPC
// personality derivation into a shared, exported helper this same wave
// (aligned to the re-keyed merchant|guard|scholar|rogue|noble|default
// template vocabulary) so this domain doesn't duplicate its ternary chain.
// Not yet exported in THIS isolated worktree -- see the wave brief's
// isolation-discipline note; turn-loop.test.ts vi.mocks this module.
import { deriveNpcPersonality } from './dialogue/npc-context.js';
// F-6e75fa93: fully-built, zero-LLM-cost ambient dialogue generators — see
// this finding's routed Fix text. SLATE-1 (brief, ruled 2026-08-26): both
// generators gain `packId` as a 3rd param this same wave.
import { generateAmbientLine, generateZoneAmbience, type AmbientNpcInfo } from './npc/ambient-dialogue.js';
// F-8da2e6f7: history.js imports FATAL_NARRATION_FALLBACK back from this
// file (see below); TurnHistory is used only as a type here (ExecuteTurnOpts
// below), so making that explicit keeps the two modules' mutual reference
// from becoming a real runtime import cycle.
import type { TurnHistory } from './session/history.js';
import type { ImmersionRuntime } from './runtime/immersion-runtime.js';
import type { StateTransition } from './runtime/presentation-state.js';
import type { McpToolCall } from './runtime/audio-bridge.js';
import { withTokenTracking, type SessionTokenTracker } from './game/token-tracker.js';
import type { DebugLogger } from './game/debug-logger.js';

/**
 * F-4ec3609b (ORDERING contract, game-core half): runtime-foundry added a
 * public `ImmersionRuntime.inferAndTransition(engine, events, verb):
 * PresentationState` this same wave (src/runtime/immersion-runtime.ts:206) —
 * it performs exactly the inference+transition step
 * ImmersionRuntime.processPresentation() already runs as its own first
 * step, but returns the resulting state so executeTurn() can run that step
 * *before* building narration opts instead of after. processPresentation()
 * is documented to detect the state already matches (via a tick-keyed
 * pendingTurnInference cache) and skip re-inferring when called afterward,
 * so calling both in sequence is idempotent-safe.
 *
 * Signature note: `engine` is required (not just `events`/`verb`) because
 * the inference this wraps (PresentationStateMachine.inferFromEvents) reads
 * engine.tick and engine.world.playerId/world directly — the class never
 * caches `engine` internally, matching processPresentation()'s own first
 * parameter. An earlier draft of this type omitted `engine`; reconciled
 * against the real shipped method (contract adjudication, wave 16) since a
 * 2-arg call would silently pass `events` where `engine` is expected on the
 * merged tree.
 *
 * src/runtime/** is runtime-foundry-owned and out of this domain's edit
 * scope, so the method can't be added to the real class from here. This
 * local intersection type documents the contract at the one call site that
 * needs it (below) without editing immersion-runtime.ts; once
 * runtime-foundry's half lands, the real class structurally satisfies this
 * type with no further change required here.
 *
 * F-6bc0721e (SLATE-6 mechanism, brief ruled 2026-08-26): runtime-foundry
 * broadens this method's return type from a bare PresentationState to the
 * full StateTransition ({from, to, trigger} — already exported from
 * src/runtime/presentation-state.ts) this same wave, so executeTurn() can
 * detect the from!='menu' -> to=='menu' edge (a fresh player defeat) instead
 * of only the resulting label. `.to` replaces the old return value
 * everywhere it was consumed as presentationState below.
 */
type ImmersionRuntimeWithInference = ImmersionRuntime & {
  inferAndTransition(engine: Engine, events: ResolvedEvent[], verb: string): StateTransition;
};

export type ProfileUpdateHints = {
  xpGained: number;
  injurySustained?: { name: string; description: string };
  milestoneTriggered?: { label: string; description: string; tags: string[] };
  reputationDelta?: { factionId: string; delta: number };
  pressureResolution?: { pressureId: string; resolutionType: ResolutionType };
};

export type TurnResult = {
  playerInput: string;
  interpreted: InterpretedAction;
  events: ResolvedEvent[];
  narration: string;
  narrationPlan: NarrationPlan | null;
  dialogue: DialogueResult | null;
  audioCalls: McpToolCall[];
  tick: number;
  profileHints: ProfileUpdateHints;
  /**
   * F-940cd4d0: true when `narration` is a fallback sentinel (narrator.ts's
   * FALLBACK_NARRATION/FALLBACK_NARRATION_REPEATED) rather than real authored
   * prose -- i.e. narrationResult.isFallback on the normal-path return.
   * Precisely scoped to "the narrator itself degraded": explicitly `false`
   * on the low-confidence clarification and engine.submitAction-catch early
   * returns below, since narrateScene never runs in either branch and a
   * clarification request is a distinct UX path, not a narrator outage.
   * game.ts threads this into a consecutiveFallbacks counter so a sustained
   * outage can switch to FALLBACK_NARRATION_REPEATED instead of repeating
   * the isolated-hiccup sentence forever.
   */
  isFallback: boolean;
  /**
   * F-6e75fa93: zero-LLM-cost ambient NPC chatter lines generated this turn
   * (Step 4.6), when the cadence gate fired and the current zone had NPCs to
   * draw from. Undefined (not an empty array) on every suppressed turn.
   */
  ambientLines?: string[];
  /**
   * F-6bc0721e (SLATE-6, brief ruled 2026-08-26): true exactly on the turn
   * whose own presentation-state transition crosses from a non-'menu' state
   * into 'menu' (a fresh player defeat this turn) -- `false` for every other
   * turn, including one that merely continues an already-downed session
   * (restored from a save, or a subsequent turn while still down). Computed
   * from inferAndTransition()'s StateTransition ({from, to}); `false` when
   * no immersion runtime is present at all (nothing to infer from).
   */
  justDied: boolean;
};

// F-c4332895: fallback narration recorded when narrateScene rethrows a fatal
// NarrationError (auth/bad-request — non-retryable, per narrator.ts's
// F-304fc328 contract). engine.submitAction() has already mutated world
// state for this turn by the time narrateScene runs, so this text stands in
// for the real narration that couldn't be generated — it is honest about
// the gap rather than in-fiction flavor text, since it also becomes part of
// the persisted turn history other narration prompts read as context.
// F-8da2e6f7: the single definition lives in narrator.ts beside its sibling
// FALLBACK_NARRATION and the KNOWN_FALLBACK_NARRATION_SENTINELS list; this
// re-export keeps the existing import path for session/history.ts stable
// without creating a cycle (history → turn-loop → narrator stays one-way).
export { FATAL_NARRATION_FALLBACK } from './narrator/narrator.js';

/**
 * F-c4332895: turn-bookkeeping data attached to an error rethrown by
 * executeTurn() when narrateScene() fails after engine.submitAction() has
 * already mutated world state for this turn. game.ts's processInput() reads
 * this back (via getFatalTurnBookkeeping()) so it can keep
 * recordChronicleEvents()/applyProfileHints() in sync with the turn
 * history.record() already wrote, instead of silently skipping them because
 * executeTurn() never returned a TurnResult.
 */
export type FatalTurnBookkeeping = {
  events: ResolvedEvent[];
  interpreted: InterpretedAction;
  profileHints: ProfileUpdateHints;
  tick: number;
  /** The same fallback text executeTurn() already wrote via history.record(). */
  narration: string;
};

const FATAL_TURN_BOOKKEEPING = Symbol('fatalTurnBookkeeping');

type ErrorWithFatalTurnBookkeeping = Error & { [FATAL_TURN_BOOKKEEPING]?: FatalTurnBookkeeping };

/**
 * Read back the bookkeeping executeTurn()'s fatal-narration catch attached
 * to a rethrown error, if any. The error reference is unchanged (not
 * wrapped) so `instanceof NarrationError` checks elsewhere — e.g.
 * error-presenter.ts's player-facing classification — keep working exactly
 * as before.
 */
export function getFatalTurnBookkeeping(err: unknown): FatalTurnBookkeeping | undefined {
  if (err instanceof Error) {
    return (err as ErrorWithFatalTurnBookkeeping)[FATAL_TURN_BOOKKEEPING];
  }
  return undefined;
}

export type ExecuteTurnOpts = {
  engine: Engine;
  client: ClaudeClient;
  history: TurnHistory;
  playerInput: string;
  tone: string;
  immersion?: ImmersionRuntime;
  characterPresence?: string;
  npcPlayerPresence?: string;
  playerProfile?: CharacterProfile | null;
  playerRumors?: PlayerRumor[];
  pressureContext?: string[];
  worldPressures?: WorldPressure[];
  lastNpcActions?: NpcActionResult[];
  districtDescriptor?: string;
  partyPresence?: string;
  economyContext?: string;
  craftingContext?: string;
  opportunityContext?: string;
  arcContext?: string;
  endgameContext?: string;
  /**
   * F-7815df9e: long-term campaign memory for the narrator, computed by the
   * caller from buildChronicleContext()/TurnHistory.getChronicleHighlights()
   * so scene narration can callback to past story beats beyond the last few
   * turns of raw narration text.
   */
  chronicleContext?: string;
  onNarrationChunk?: StreamCallback;
  /**
   * F-b4b16d0a: when provided, every generate()/generateStream() call this
   * turn makes (via narrateScene/generateDialogue — see the withTokenTracking
   * doc comment for why interpretAction's generateStructured() calls aren't
   * counted) is recorded into it under the appropriate CallType, powering
   * GameSession.getCostSummary(). Optional so existing callers/tests that
   * don't pass one see `client` passed through completely unwrapped.
   */
  tokenTracker?: SessionTokenTracker;
  /**
   * F-462792bb (SLATE-2, persisted per Director ruling R2): the WHOLE
   * per-NPC conversation-history map, not a pre-resolved slice -- game.ts
   * calls executeTurn() before Step 1 (inside executeTurn) resolves which
   * NPC is being spoken to, so the caller structurally cannot pre-filter by
   * npcId before this call. Step 5 below does the per-NPC lookup itself once
   * `interpreted.targetIds[0]` is known.
   */
  conversationHistory?: Map<string, ConversationExchange[]>;
  /**
   * F-940cd4d0: count of consecutive non-fatal narrateScene fallbacks
   * immediately preceding this turn, forwarded straight into narrateScene's
   * own opts (narrator.ts's NarrateSceneOpts.consecutiveFallbacks) so a
   * sustained outage can switch to FALLBACK_NARRATION_REPEATED. game.ts
   * tracks this as a session-local (non-persisted) counter.
   */
  consecutiveFallbacks?: number;
  /**
   * F-9976a6d6 (SLATE-5e, option (a) only per Director ruling R3): optional
   * structured logger. When provided, the interpreter's already-computed
   * reasoning (InterpretedAction.reasoning) is logged for every confidence
   * tier, not just the low-confidence clarification path that already reads
   * it below -- a true no-op via NoopLogger for every non-debug session.
   */
  debugLog?: DebugLogger;
  /**
   * F-6e75fa93 (SLATE-1 packId, brief ruled 2026-08-26): forwarded as the
   * 3rd positional arg to generateAmbientLine/generateZoneAmbience. Mirrors
   * GameSession's existing packId field (game.ts) — undefined for
   * custom/non-pack worlds, same as every other optional context field.
   */
  packId?: string;
};

/**
 * F-4fc952ae (coordinator-locked design, wave-4 addendum): the curated verb
 * surface claude-rpg's interpreter is allowed to offer the player, restoring
 * the pre-3.9 curated product surface. 3.9 registered a large batch of new
 * top-level engine verbs (individual leverage verbs, standalone
 * salvage/repair/modify, tactical-combat/commerce/dialogue verbs) that this
 * product has never wired up anywhere (zero references outside
 * node_modules) -- left unfiltered, they leak into the LLM slow path's
 * available-verbs prompt (inviting e.g. "bribe the guard" to resolve to the
 * engine's bare `bribe` verb, which claude-rpg's own leverage system never
 * reads) even though the interpreter's own fast-paths and the help screen
 * never advertise them.
 *
 * Two families:
 * - claude-rpg's own five aggregate categories: `social`/`rumor`/
 *   `diplomacy`/`sabotage` (game.ts's registerLeverageVerbs() thin
 *   `${verb}.action.attempted` handlers, `override: true` for `sabotage`
 *   since 3.9's player-leverage module already claims that name) and
 *   `craft` (same registerLeverageVerbs() override, superseding 3.9's
 *   crafting module's own `craft`). Each dispatches via
 *   parameters.subAction -- action-interpreter.ts's tryLeverageVerb() and
 *   the craft/salvage/repair/modify fast-path both already target this
 *   pattern, not a bare top-level verb.
 * - the core verbs action-interpreter.ts's own fast-paths, the help
 *   screen's BASIC ACTIONS block, and game.ts/session/history already
 *   handle end to end: move, look/inspect, attack, speak, use, equip,
 *   unequip, take, drop, inventory, opportunity.
 *
 * Deliberately excludes every other 3.9 verb (see KNOWN_EXCLUDED_VERBS) --
 * Director-gated feature candidates, not yet a product decision. Do not add
 * to this set without a corresponding fast-path/help/test surface backing
 * it up (the same "do NOT guess beyond what the product already surfaces"
 * discipline this set was built with).
 */
export const SUPPORTED_VERBS: ReadonlySet<string> = new Set([
  // claude-rpg's own five aggregate leverage/craft categories
  'social', 'rumor', 'diplomacy', 'sabotage', 'craft',
  // core verbs action-interpreter's fast-paths + help screen + game.ts/
  // session/history already handle end to end
  'move', 'look', 'inspect', 'attack', 'speak', 'use',
  'equip', 'unequip', 'take', 'drop', 'inventory', 'opportunity',
]);

/**
 * 3.9-new verbs consciously excluded this wave (Director-gated feature
 * candidates), pinned so the drift test in turn-loop.test.ts can tell
 * "known and deliberately not shipped yet" apart from "genuinely new,
 * never reviewed." Every entry here is a real verb the installed engine
 * registers today (see turn-loop.test.ts's drift test) that has zero
 * reference anywhere in this product's own source. Add to SUPPORTED_VERBS
 * instead, once a verb actually ships -- this is not a dumping ground.
 */
export const KNOWN_EXCLUDED_VERBS: ReadonlySet<string> = new Set([
  // Individual leverage verbs -- superseded by the social/rumor/diplomacy/
  // sabotage aggregate + parameters.subAction pattern above.
  'bribe', 'intimidate', 'recruit', 'petition', 'call-in-favor',
  'recruit-ally', 'disguise', 'stake-claim',
  'seed', 'deny', 'frame', 'claim-false-credit', 'bury-scandal',
  'leak-truth', 'spread-counter-rumor',
  'request-meeting', 'improve-standing', 'cash-milestone',
  'negotiate-access', 'trade-secret', 'temporary-alliance', 'broker-truce',
  'plant-evidence', 'blackmail-target', 'incite-riot',
  // Standalone crafting-adjacent verbs -- superseded by the existing craft
  // + parameters.subAction pattern above.
  'salvage', 'repair', 'modify',
  // Tactical-combat / commerce / dialogue / system verbs this product has
  // never wired up (no fast-path, no help text, no game.ts/session
  // reference of any kind).
  'guard', 'brace', 'disengage', 'reposition',
  'buy', 'sell', 'give', 'unlock', 'choose', 'use-ability',
  'resolve-pressure', 'cognition-tick', 'environment-tick',
  'faction-tick', 'district-tick',
]);

/**
 * Filter the engine's raw available-verbs list down to SUPPORTED_VERBS
 * before it reaches interpretAction() -- see SUPPORTED_VERBS' doc comment
 * for why. A verb absent from both SUPPORTED_VERBS and KNOWN_EXCLUDED_VERBS
 * is never silently dropped un-reviewed in production: turn-loop.test.ts's
 * drift test fails loudly against the real installed engine so a future
 * verb becomes a conscious allow/exclude decision instead of a silent
 * pass-through.
 */
export function filterSupportedVerbs(rawVerbs: string[]): string[] {
  return rawVerbs.filter((v) => SUPPORTED_VERBS.has(v));
}

/** Execute one full turn of the game loop. */
export async function executeTurn(opts: ExecuteTurnOpts): Promise<TurnResult> {
  const {
    engine, client, history, playerInput, tone, immersion,
    characterPresence, npcPlayerPresence, playerProfile, playerRumors,
    pressureContext, worldPressures, lastNpcActions, districtDescriptor,
    partyPresence, economyContext, craftingContext, opportunityContext,
    arcContext, endgameContext, chronicleContext, onNarrationChunk,
    tokenTracker, conversationHistory, consecutiveFallbacks, debugLog, packId,
  } = opts;
  const previousLocationId = engine.world.locationId;

  // F-b4b16d0a: per-call-type client wraps so GameSession.getCostSummary()
  // can report narration/dialogue cost separately. Only constructed when the
  // caller actually wants tracking — everything below uses `client`
  // unwrapped otherwise, unchanged from before this wave.
  const narrationClient = tokenTracker ? withTokenTracking(client, tokenTracker, 'narration') : client;
  const dialogueClient = tokenTracker ? withTokenTracking(client, tokenTracker, 'dialogue') : client;

  // Step 1: Interpret player input into an action
  // F-4fc952ae: filter through the curated allowlist BEFORE this list
  // reaches interpretAction() -- see SUPPORTED_VERBS' doc comment above.
  const availableVerbs = filterSupportedVerbs(engine.getAvailableActions());
  // F-fb9e78af: if the turn immediately before this one was itself a
  // clarification request, hand the interpreter that context so a short
  // follow-up reply (e.g. just "attack") isn't interpreted from scratch
  // with no memory the clarification ever happened.
  const lastTurn = history.getRecent(1)[0];
  const recentContext = lastTurn?.isClarification
    ? `Player said "${lastTurn.playerInput}" and was asked to clarify: "${lastTurn.narration}"`
    : undefined;
  const interpreted = await interpretAction(
    client,
    engine.world,
    playerInput,
    availableVerbs,
    recentContext,
  );

  // F-9976a6d6 (SLATE-5e, option (a) only per Director ruling R3): surface
  // the interpreter's already-computed reasoning to --debug diagnostics for
  // every confidence tier, not just the low-confidence branch below (which
  // already reads it for a different reason -- clarification copy). True
  // no-op via NoopLogger when --debug/CLAUDE_RPG_DEBUG is not set.
  debugLog?.debug('interpret', 'action-reasoning', {
    verb: interpreted.verb,
    confidence: interpreted.confidence,
    reasoning: interpreted.reasoning,
  });

  // If low confidence, return clarification without resolving
  if (interpreted.confidence === 'low') {
    // F-fb9e78af: prefer the full alternative (verb plus resolved target
    // name, when the interpreter supplied one) over a bare verb list, so
    // "attack or flee" can become e.g. "attack the Suspicious Pilgrim or
    // flee" instead of losing which entity each alternative meant.
    const alts = interpreted.alternatives?.length
      ? interpreted.alternatives.map((a) => describeAlternative(a, engine.world)).join(' or ')
      : undefined;
    // F-e8262ed1: interpreted.reasoning already distinguishes a transient
    // API failure (PB-007's "...interpretation service unavailable — try
    // again") from genuinely ambiguous input ("Could not interpret input")
    // — surface it instead of a generic "something else" that reads
    // identically for both and contradicted PB-007's stated intent.
    const clarification = alts
      ? `I'm not sure what you mean. Did you want to ${alts}?`
      : interpreted.reasoning
        ? `I'm not sure what you mean. ${interpreted.reasoning}`
        : `I'm not sure what you mean. Did you want to do something else?`;
    // F-fb9e78af: record the clarification turn (mirroring the isFallback
    // pattern narrateScene/dialogue fallbacks already use for non-authored
    // text) so a short follow-up reply can be given the recentContext built
    // from it above, and so getRecentNarration() excludes it from future
    // narration prompts the same way it already excludes other fallback
    // text.
    history.record({
      tick: engine.tick,
      playerInput,
      verb: interpreted.verb,
      narration: clarification,
      isFallback: true,
      isClarification: true,
    });
    return {
      playerInput,
      interpreted,
      events: [],
      narration: clarification,
      narrationPlan: null,
      dialogue: null,
      audioCalls: [],
      tick: engine.tick,
      profileHints: { xpGained: 0 },
      // F-940cd4d0: narrateScene never ran in this branch -- this is a
      // distinct UX path (clarification request), not a narrator outage.
      isFallback: false,
      // F-6bc0721e: no engine action resolved, so no presentation-state
      // transition happened this turn either.
      justDied: false,
    };
  }

  // Step 2: Resolve through the engine
  let events: ResolvedEvent[] = [];
  try {
    events = engine.submitAction(interpreted.verb, {
      targetIds: interpreted.targetIds ?? undefined,
      toolId: interpreted.toolId ?? undefined,
      parameters: interpreted.parameters ?? undefined,
    });
  } catch {
    return {
      playerInput,
      interpreted,
      events: [],
      narration: `You try to ${interpreted.verb}, but nothing happens.`,
      narrationPlan: null,
      dialogue: null,
      audioCalls: [],
      tick: engine.tick,
      profileHints: { xpGained: 0 },
      // F-940cd4d0: narrateScene never ran -- the action didn't even resolve.
      isFallback: false,
      // F-6bc0721e: no events resolved, so no transition happened.
      justDied: false,
    };
  }

  // Step 3 + 4: Build scene context with perception filtering and narrate
  const recentNarration = history.getRecentNarration(3);
  // F-4ec3609b: infer + apply THIS turn's presentation-state transition
  // before narration reads it, not after. Reading immersion.stateMachine
  // .current here (as this used to) reflects whatever the PRIOR turn last
  // transitioned to, because inference+transition previously only ran
  // inside processPresentation() at Step 4.5, below — strictly after
  // narrateScene already ran. inferAndTransition() runs that same
  // inference+transition early and returns the resulting state, so the
  // narrator's prose is generated from this turn's own state label instead
  // of lagging one turn behind (see the type doc comment above for the
  // cross-domain contract this leans on).
  // F-6bc0721e (SLATE-6 mechanism, brief ruled 2026-08-26): inferAndTransition
  // now returns the full StateTransition ({from, to, trigger}), not just the
  // resulting label -- `.to` replaces the old bare return value below, and
  // the from/to pair also lets this turn detect a fresh player-defeat edge
  // (see `justDied` on the final return).
  const transition = immersion
    ? (immersion as ImmersionRuntimeWithInference).inferAndTransition(engine, events, interpreted.verb)
    : undefined;
  const presentationState = transition?.to;
  let narrationResult: NarrationResult;
  try {
    narrationResult = await narrateScene({
      client: narrationClient,
      world: engine.world,
      recentEvents: events,
      tone,
      recentNarration,
      previousLocationId,
      presentationState,
      characterPresence,
      activePressures: pressureContext,
      districtDescriptor,
      partyPresence,
      economyContext,
      craftingContext,
      opportunityContext,
      arcContext,
      endgameContext,
      onChunk: onNarrationChunk,
      chronicleContext,
      consecutiveFallbacks,
    });
  } catch (err) {
    // F-c4332895: engine.submitAction() above has already mutated world
    // state (combat resolved, items taken, zones changed) by the time
    // narrateScene runs. narrateScene only lets an error escape for fatal
    // NarrationError kinds (auth/bad-request — see its own F-304fc328
    // try/catch, which absorbs every other kind into a fallback
    // NarrationResult instead of throwing), so that mutation must not be
    // left unrecorded just because this function is about to throw too.
    // Record the turn with fallback narration and extract profile hints
    // from the events that already happened, attach that bookkeeping to the
    // error for game.ts's processInput() to recover, then rethrow so the
    // caller still surfaces the actionable message.
    const profileHints = extractProfileHints(events, interpreted.verb, engine.world, worldPressures);
    history.record({
      tick: engine.tick,
      playerInput,
      verb: interpreted.verb,
      narration: FATAL_NARRATION_FALLBACK,
      isFallback: true,
    });
    if (err instanceof Error) {
      (err as ErrorWithFatalTurnBookkeeping)[FATAL_TURN_BOOKKEEPING] = {
        events,
        interpreted,
        profileHints,
        tick: engine.tick,
        narration: FATAL_NARRATION_FALLBACK,
      };
    }
    throw err;
  }

  // Step 4.5: Process through immersion runtime if available.
  // F-4ec3609b: the inference+transition this used to do FIRST now already
  // happened above (inferAndTransition, before narration) whenever
  // `immersion` is set — processPresentation() is documented (runtime-
  // foundry contract) to detect its state already matches and skip
  // re-inferring in that case, so this call still runs unconditionally for
  // its audio/hook side effects without double-transitioning.
  let audioCalls: McpToolCall[] = [];
  if (immersion) {
    audioCalls = await immersion.processPresentation(
      engine,
      events,
      interpreted.verb,
      narrationResult.plan ?? undefined,
    );
  }

  // Step 4.6 (F-6e75fa93): zero-LLM-cost ambient NPC chatter. Fires only
  // during ordinary exploration (the only presentationState this turn
  // realistically observes for this purpose -- F-5a0021c9 confirmed
  // 'tension'/'dream' are structurally unreachable and 'director' never
  // reaches executeTurn), on a zone entry (high value, first impression) or
  // a periodic stateless quiet-turn heuristic (deliberately not tracking
  // "turns since last fired" as new mutable state -- tick%5 is already
  // deterministic and already persists via engineState across save/load).
  let ambientLines: string[] | undefined;
  if (presentationState === 'exploration') {
    const zoneEntered = engine.world.locationId !== previousLocationId;
    const periodicQuiet = engine.tick % 5 === 0 && events.length === 0;
    if (zoneEntered || periodicQuiet) {
      // Same zone-NPC enumeration pattern already used by
      // detectPressureResolution below (Object.values + zoneId/playerId
      // filter).
      const zoneNpcs = Object.values(engine.world.entities).filter(
        (e) => e.zoneId === engine.world.locationId && e.id !== engine.world.playerId,
      );
      if (zoneNpcs.length === 1) {
        // Exactly 1 NPC: generateZoneAmbience requires >=2 and silently
        // returns [] otherwise -- using only the zone function would
        // permanently lose ambient color for the common single-NPC-zone
        // case (e.g. a lone shopkeeper).
        const seed = engine.store.rng.int(0, 1_000_000);
        ambientLines = [generateAmbientLine(buildAmbientNpcInfo(engine.world, zoneNpcs[0]), seed, packId)];
      } else if (zoneNpcs.length >= 2) {
        // One rng draw per triggering turn (not per NPC) -- the shared RNG
        // stream is already save/load-continuous, and generateZoneAmbience
        // fans the single seed out per-NPC internally (effectiveSeed + i).
        const seed = engine.store.rng.int(0, 1_000_000);
        ambientLines = generateZoneAmbience(
          zoneNpcs.map((npc) => buildAmbientNpcInfo(engine.world, npc)),
          seed,
          packId,
        );
      }
    }
  }

  // Step 5: Generate NPC dialogue if speaking
  let dialogue: DialogueResult | null = null;
  if (interpreted.verb === 'speak' && interpreted.targetIds?.[0]) {
    try {
      dialogue = await generateDialogue(
        dialogueClient,
        engine.world,
        interpreted.targetIds[0],
        playerInput,
        tone,
        npcPlayerPresence,
        playerProfile,
        playerRumors,
        worldPressures,
        lastNpcActions,
        economyContext,
        craftingContext,
        // F-462792bb (SLATE-2, persisted per Director ruling R2): Step 5 is
        // the first point in this turn that knows WHICH npcId is being
        // spoken to (interpreted.targetIds[0]) -- the caller passes the
        // whole map because it can't pre-filter before that's resolved (see
        // ExecuteTurnOpts.conversationHistory's doc comment).
        opportunityContext,
        conversationHistory?.get(interpreted.targetIds[0]),
      );

      // Add voice cast to dialogue if immersion is active
      if (dialogue && immersion) {
        const cast = immersion.getVoiceCast(interpreted.targetIds[0]);
        dialogue.voiceCast = {
          voiceId: cast.voiceId,
          emotion: cast.defaultEmotion,
          speed: cast.defaultSpeed,
        };
      }
    } catch (err) {
      // F-b6494bc2: mirrors Step 3+4's F-c4332895 catch above. By the time
      // Step 5 runs, engine.submitAction() has already mutated world state
      // AND narrateScene has already succeeded (narrationResult.narration is
      // real, authored prose) — generateDialogue only lets an error escape
      // for fatal NarrationError kinds (auth/bad-request, its own
      // F-6480985e contract mirroring narrateScene's F-304fc328), realistic
      // here specifically because buildDialoguePrompt's NPC-context payload
      // is an independently-sized/shaped request from buildNarratePrompt's
      // and can trip a request-level rejection the narration call didn't.
      // That already-succeeded narration must not be lost just because the
      // dialogue on top of it failed: record the turn with it (dialogue
      // omitted — it never completed), attach bookkeeping so game.ts's
      // existing recovery path (including emitPresentation) engages exactly
      // as it does for the narrateScene-origin case, then rethrow.
      const profileHints = extractProfileHints(events, interpreted.verb, engine.world, worldPressures);
      history.record({
        tick: engine.tick,
        playerInput,
        verb: interpreted.verb,
        narration: narrationResult.narration,
        isFallback: narrationResult.isFallback,
      });
      if (err instanceof Error) {
        (err as ErrorWithFatalTurnBookkeeping)[FATAL_TURN_BOOKKEEPING] = {
          events,
          interpreted,
          profileHints,
          tick: engine.tick,
          narration: narrationResult.narration,
        };
      }
      throw err;
    }
  }

  // Extract profile hints from events (includes pressure resolution detection)
  const profileHints = extractProfileHints(events, interpreted.verb, engine.world, worldPressures);

  // Record turn in history
  history.record({
    tick: engine.tick,
    playerInput,
    verb: interpreted.verb,
    narration: narrationResult.narration,
    dialogue: dialogue
      ? { speaker: dialogue.speakerName, text: dialogue.text }
      : undefined,
    isFallback: narrationResult.isFallback,
  });

  return {
    playerInput,
    interpreted,
    events,
    narration: narrationResult.narration,
    narrationPlan: narrationResult.plan,
    dialogue,
    audioCalls,
    tick: engine.tick,
    profileHints,
    isFallback: narrationResult.isFallback,
    ambientLines,
    // F-6bc0721e: true exactly on the edge into 'menu' from a non-'menu'
    // state this turn -- a resumed already-downed session (restored state
    // already 'menu' at construction) has no in-turn transition to compare
    // against, so it correctly reports false; the downed *gate* itself
    // (game.ts) reads stateMachine.current directly and doesn't depend on
    // this edge flag.
    justDied: transition ? transition.to === 'menu' && transition.from !== 'menu' : false,
  };
}

/**
 * F-6e75fa93: build the minimal NPC info ambient-dialogue.ts's generators
 * need from a world entity — personality via narrative-llm's shared
 * deriveNpcPersonality() (SLATE-1), beliefs flattened from cognition state
 * into the `${subject}.${key}: value` shape ambient-dialogue.ts's
 * BELIEF_OVERLAYS pattern-match against (mirrors npc-context.ts's own belief
 * handling, cross-domain).
 */
function buildAmbientNpcInfo(world: WorldState, npc: EntityState): AmbientNpcInfo {
  const cognition = getCognition(world, npc.id);
  const beliefs: Record<string, string | number | boolean> = {};
  for (const b of cognition?.beliefs ?? []) {
    beliefs[`${b.subject}.${b.key}`] = b.value;
  }
  return {
    name: npc.name,
    personality: deriveNpcPersonality(npc),
    beliefs,
  };
}

/**
 * F-fb9e78af: render one interpreted alternative as "verb" or, when a
 * target id is present and resolves to a real entity, "verb Name" — so the
 * low-confidence clarification can say e.g. "attack the Suspicious Pilgrim
 * or flee" instead of losing which entity each alternative meant.
 */
function describeAlternative(
  alt: { verb: string; targetIds: string[] },
  world: WorldState,
): string {
  const targetId = alt.targetIds?.[0];
  const targetName = targetId ? world.entities[targetId]?.name : undefined;
  return targetName ? `${alt.verb} ${targetName}` : alt.verb;
}

/** Extract profile update hints from resolved events. */
export function extractProfileHints(
  events: ResolvedEvent[],
  verb: string,
  world: WorldState,
  activePressures?: WorldPressure[],
): ProfileUpdateHints {
  const hints: ProfileUpdateHints = { xpGained: 0 };

  for (const event of events) {
    switch (event.type) {
      case 'combat.entity.defeated': {
        hints.xpGained += 15;

        // Reputation: killing a faction member angers their faction
        const defeatedId = event.payload.entityId as string | undefined;
        if (defeatedId) {
          const factionId = getEntityFaction(world, defeatedId);
          if (factionId) {
            // Accumulate reputation: each kill in a multi-kill turn stacks
            if (hints.reputationDelta && hints.reputationDelta.factionId === factionId) {
              hints.reputationDelta.delta += -15;
            } else if (!hints.reputationDelta) {
              hints.reputationDelta = { factionId, delta: -15 };
            }
            // Note: if kills span multiple factions, only the first faction's delta is tracked
            // (single-delta-per-turn limitation of ProfileUpdateHints shape)
          }

          // Milestone: defeating a boss
          const entity = world.entities[defeatedId];
          if (entity?.tags.includes('boss') && !hints.milestoneTriggered) {
            hints.milestoneTriggered = {
              label: `Defeated ${entity.name}`,
              description: `Slew ${entity.name} in combat.`,
              tags: ['combat', 'boss-kill'],
            };
          }
        }
        break;
      }
      case 'world.zone.entered': {
        hints.xpGained += 5;

        // Milestone: entering a landmark or boss lair
        const zoneId = event.payload.zoneId as string | undefined;
        if (zoneId && !hints.milestoneTriggered) {
          const zone = world.zones[zoneId];
          if (zone) {
            const tags = zone.tags ?? [];
            if (tags.includes('boss-lair') || tags.includes('landmark')) {
              const tag = tags.includes('boss-lair') ? 'boss-lair' : 'landmark';
              hints.milestoneTriggered = {
                label: `Entered ${zone.name}`,
                description: `Discovered ${zone.name}.`,
                tags: ['exploration', tag],
              };
            }
          }
        }
        break;
      }
      case 'combat.damage.applied': {
        const dmg = event.payload.damage as number | undefined;
        if (dmg && dmg >= 10) {
          hints.injurySustained = {
            name: 'Battle Wound',
            description: `Sustained ${dmg} damage in combat.`,
          };
        }
        break;
      }
      case 'inventory.item.received':
        hints.xpGained += 3;
        break;
    }
  }

  // Base XP for taking any action
  if (verb !== 'look' && events.length > 0) {
    hints.xpGained += 2;
  }

  // Pressure resolution detection (heuristic, no LLM call)
  if (activePressures && activePressures.length > 0) {
    hints.pressureResolution = detectPressureResolution(events, verb, world, activePressures);
  }

  return hints;
}

/**
 * Heuristic: match player actions against active pressures.
 * False negatives are fine — undetected resolutions just expire normally.
 */
function detectPressureResolution(
  events: ResolvedEvent[],
  verb: string,
  world: WorldState,
  pressures: WorldPressure[],
): ProfileUpdateHints['pressureResolution'] {
  // Combat victory → resolves bounty or revenge attempt
  const defeatedFactions = new Set<string>();
  for (const event of events) {
    if (event.type === 'combat.entity.defeated') {
      const defeatedId = event.payload.entityId as string | undefined;
      if (defeatedId) {
        const factionId = getEntityFaction(world, defeatedId);
        if (factionId) defeatedFactions.add(factionId);
      }
    }
  }

  if (defeatedFactions.size > 0) {
    for (const p of pressures) {
      if (
        (p.kind === 'bounty-issued' || p.kind === 'revenge-attempt') &&
        defeatedFactions.has(p.sourceFactionId)
      ) {
        return { pressureId: p.id, resolutionType: 'resolved-by-player' };
      }
    }
  }

  // Speaking to a faction with a summons → resolves it
  if (verb === 'speak') {
    for (const p of pressures) {
      if (p.kind === 'faction-summons') {
        // Check if we spoke to someone from that faction
        for (const entity of Object.values(world.entities)) {
          if (entity.zoneId === world.locationId && entity.id !== world.playerId) {
            const factionId = getEntityFaction(world, entity.id);
            if (factionId === p.sourceFactionId) {
              return { pressureId: p.id, resolutionType: 'resolved-by-player' };
            }
          }
        }
      }
    }
  }

  return undefined;
}
