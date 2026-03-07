// GameSession: master orchestrator wiring Engine + Claude + UI + Immersion
// v0.2: integrated with ImmersionRuntime

import type { Engine } from '@ai-rpg-engine/core';
import { createClaudeClient, type ClaudeClient, type ClaudeClientConfig } from './claude-client.js';
import { TurnHistory } from './session/history.js';
import { executeTurn, type TurnResult } from './turn-loop.js';
import { renderPlayScreen, renderWelcome, renderThinking } from './display/play-renderer.js';
import { executeDirectorCommand, renderDirectorHelp } from './display/director-renderer.js';
import { narrateScene } from './narrator/narrator.js';
import { ImmersionRuntime, type ImmersionConfig } from './runtime/immersion-runtime.js';

export type GameMode = 'play' | 'director';

export type GameConfig = {
  engine: Engine;
  clientConfig?: ClaudeClientConfig;
  tone?: string;
  title?: string;
  worldPrompt?: string;
  immersion?: ImmersionConfig;
};

export class GameSession {
  readonly engine: Engine;
  readonly client: ClaudeClient;
  readonly history: TurnHistory;
  readonly tone: string;
  readonly title: string;
  readonly worldPrompt?: string;
  readonly immersion: ImmersionRuntime;
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
  }

  /** Get the welcome screen text. */
  getWelcome(): string {
    return renderWelcome(this.title, this.tone);
  }

  /** Get the initial scene narration. */
  async getOpeningNarration(): Promise<string> {
    const result = await narrateScene(
      this.client,
      this.engine.world,
      [],
      this.tone,
      [],
      undefined,
      this.immersion.stateMachine.current,
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

    // Play mode: execute a turn with immersion
    const turnResult = await executeTurn(
      this.engine,
      this.client,
      this.history,
      trimmed,
      this.tone,
      this.immersion,
    );

    return renderPlayScreen({
      narration: turnResult.narration,
      dialogue: turnResult.dialogue,
      world: this.engine.world,
      availableActions: this.engine.getAvailableActions(),
    });
  }

  /** Get the "thinking" indicator. */
  getThinking(): string {
    return renderThinking();
  }
}
