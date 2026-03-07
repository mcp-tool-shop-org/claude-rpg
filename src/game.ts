// GameSession: master orchestrator wiring Engine + Claude + UI + Immersion
// v0.2: integrated with ImmersionRuntime
// v0.3: character profile awareness

import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import {
  grantXp,
  addInjury,
  incrementTurns,
} from '@ai-rpg-engine/character-profile';
import { createClaudeClient, type ClaudeClient, type ClaudeClientConfig } from './claude-client.js';
import { TurnHistory } from './session/history.js';
import { executeTurn, type TurnResult, type ProfileUpdateHints } from './turn-loop.js';
import { renderPlayScreen, renderWelcome, renderThinking } from './display/play-renderer.js';
import { executeDirectorCommand, renderDirectorHelp } from './display/director-renderer.js';
import { narrateScene } from './narrator/narrator.js';
import { ImmersionRuntime, type ImmersionConfig } from './runtime/immersion-runtime.js';
import { buildPresence, buildStatusData, type StatusData } from './character/presence.js';

export type GameMode = 'play' | 'director';

export type GameConfig = {
  engine: Engine;
  clientConfig?: ClaudeClientConfig;
  tone?: string;
  title?: string;
  worldPrompt?: string;
  immersion?: ImmersionConfig;
  profile?: CharacterProfile;
  itemCatalog?: ItemCatalog;
};

export class GameSession {
  readonly engine: Engine;
  readonly client: ClaudeClient;
  readonly history: TurnHistory;
  readonly tone: string;
  readonly title: string;
  readonly worldPrompt?: string;
  readonly immersion: ImmersionRuntime;
  readonly itemCatalog: ItemCatalog | null;
  profile: CharacterProfile | null;
  mode: GameMode = 'play';

  constructor(config: GameConfig) {
    this.engine = config.engine;
    this.client = createClaudeClient(config.clientConfig);
    this.history = new TurnHistory();
    this.tone = config.tone ?? 'dark fantasy, concise, atmospheric';
    this.title = config.title ?? 'claude-rpg';
    this.worldPrompt = config.worldPrompt;
    this.immersion = new ImmersionRuntime(config.immersion);
    this.immersion.initialize(this.engine);
    this.profile = config.profile ?? null;
    this.itemCatalog = config.itemCatalog ?? null;
  }

  /** Get the welcome screen text. */
  getWelcome(): string {
    return renderWelcome(this.title, this.tone);
  }

  /** Get presence strings from current profile state. */
  getPresence(): { narrator?: string; npc?: string } {
    if (!this.profile || !this.itemCatalog) return {};
    const presence = buildPresence(this.profile, this.itemCatalog);
    return { narrator: presence.narratorSummary, npc: presence.npcPerception };
  }

  /** Get status data for enhanced status bar. */
  getStatusData(): StatusData | null {
    if (!this.profile || !this.itemCatalog) return null;
    return buildStatusData(this.profile, this.itemCatalog);
  }

  /** Apply profile update hints from a turn result. */
  applyProfileHints(hints: ProfileUpdateHints): void {
    if (!this.profile) return;

    // XP
    if (hints.xpGained > 0) {
      const { profile: updated, leveledUp, newLevel } = grantXp(this.profile, hints.xpGained);
      this.profile = updated;
      if (leveledUp) {
        console.log(`\n  Level up! You are now level ${newLevel}.\n`);
      }
    }

    // Injuries
    if (hints.injurySustained) {
      this.profile = addInjury(this.profile, {
        name: hints.injurySustained.name,
        description: hints.injurySustained.description,
        statPenalties: {},
        resourcePenalties: {},
        grantedTags: ['wounded'],
        sustainedAt: `turn-${this.engine.tick}`,
      });
    }

    // Increment turns
    this.profile = incrementTurns(this.profile);

    // Sync resources from engine entity state
    const player = this.engine.world.entities[this.engine.world.playerId];
    if (player) {
      this.profile = { ...this.profile, resources: { ...player.resources } };
    }
  }

  /** Get the initial scene narration. */
  async getOpeningNarration(): Promise<string> {
    const presence = this.getPresence();
    const result = await narrateScene(
      this.client,
      this.engine.world,
      [],
      this.tone,
      [],
      undefined,
      this.immersion.stateMachine.current,
      presence.narrator,
    );
    this.history.record({
      tick: this.engine.tick,
      playerInput: '',
      verb: 'look',
      narration: result.narration,
    });
    return renderPlayScreen({
      narration: result.narration,
      world: this.engine.world,
      availableActions: this.engine.getAvailableActions(),
      profileStatus: this.getStatusData() ?? undefined,
    });
  }

  /** Process one player input and return the rendered output. */
  async processInput(input: string): Promise<string> {
    const trimmed = input.trim();

    // Meta commands
    if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
      return '__QUIT__';
    }

    // Director mode toggle
    if (trimmed === '/director' || trimmed === '/d') {
      this.mode = 'director';
      this.immersion.stateMachine.transition('director', '/director');
      return renderDirectorHelp();
    }

    if (trimmed === '/back' || trimmed === '/b') {
      this.mode = 'play';
      this.immersion.stateMachine.transition('exploration', '/back');
      return await this.getOpeningNarration();
    }

    // Director mode commands
    if (this.mode === 'director' && trimmed.startsWith('/')) {
      return executeDirectorCommand(trimmed, this.engine.world);
    }

    // Play mode: execute a turn with immersion + character presence
    const presence = this.getPresence();
    const turnResult = await executeTurn(
      this.engine,
      this.client,
      this.history,
      trimmed,
      this.tone,
      this.immersion,
      presence.narrator,
      presence.npc,
    );

    // Apply profile hints from this turn
    this.applyProfileHints(turnResult.profileHints);

    return renderPlayScreen({
      narration: turnResult.narration,
      dialogue: turnResult.dialogue,
      world: this.engine.world,
      availableActions: this.engine.getAvailableActions(),
      profileStatus: this.getStatusData() ?? undefined,
    });
  }

  /** Get the "thinking" indicator. */
  getThinking(): string {
    return renderThinking();
  }
}
