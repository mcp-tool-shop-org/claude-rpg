// Turn history: rolling context window for narration continuity
// FT-B-006: Turn history compaction — evicted turns generate compressed summaries

export type TurnRecord = {
  tick: number;
  playerInput: string;
  verb: string;
  narration: string;
  dialogue?: { speaker: string; text: string };
};

/** Compressed summary of evicted turns for long-term memory. */
export type CompactedChunk = {
  fromTick: number;
  toTick: number;
  summary: string;
};

/**
 * F-dfd125bb: hard ceiling on retained compacted chunks. Without this,
 * _compactedChunks (and the _compactedSummary string derived from it — the
 * exact text getChronicleHighlights() folds into *every* narration prompt
 * for the rest of the session) grows by one entry per turn for the rest of
 * a campaign, since record() evicts and compacts one turn per call once the
 * rolling window is full. In a several-hundred-turn campaign — this
 * studio's target production scale — that's an unbounded, ever-growing
 * string with no ceiling. Oldest chunks are dropped first, mirroring the
 * same rolling-window eviction record() already applies to `turns`.
 */
const MAX_COMPACTED_CHUNKS = 50;

export class TurnHistory {
  private turns: TurnRecord[] = [];
  private maxTurns: number;
  private _compactedSummary: string = '';
  private _compactedChunks: CompactedChunk[] = [];

  constructor(maxTurns = 50) {
    this.maxTurns = maxTurns;
  }

  /** The accumulated compacted summary of all evicted turns. */
  get compactedSummary(): string {
    return this._compactedSummary;
  }

  /** Individual compacted chunks (for structured access). */
  get compactedChunks(): readonly CompactedChunk[] {
    return this._compactedChunks;
  }

  record(turn: TurnRecord): void {
    this.turns.push(turn);
    if (this.turns.length > this.maxTurns) {
      const evicted = this.turns.shift()!;
      this.compactEvictedTurn(evicted);
    }
  }

  /** Generate a compressed summary from an evicted turn and append it. */
  private compactEvictedTurn(turn: TurnRecord): void {
    const parts: string[] = [];

    // Location/movement
    if (turn.verb === 'move') {
      parts.push(`Traveled (tick ${turn.tick})`);
    }

    // NPC interactions
    if (turn.dialogue) {
      parts.push(`Spoke with ${turn.dialogue.speaker}`);
    }

    // Key events from narration (extract a brief summary)
    if (turn.verb === 'attack') {
      parts.push(`Fought in combat`);
    } else if (turn.verb === 'speak' && !turn.dialogue) {
      parts.push(`Attempted conversation`);
    } else if (turn.verb === 'opportunity') {
      parts.push(`Handled an opportunity`);
    } else if (turn.verb !== 'move' && turn.verb !== 'look') {
      parts.push(`${turn.verb} action`);
    }

    // If nothing interesting was extracted, note it minimally
    if (parts.length === 0) {
      parts.push(`Observed surroundings (tick ${turn.tick})`);
    }

    const chunkSummary = parts.join('; ') + '.';
    this._compactedChunks.push({
      fromTick: turn.tick,
      toTick: turn.tick,
      summary: chunkSummary,
    });

    this.trimCompactedChunks();
  }

  /** Batch-compact multiple evicted turns into a single chunk. */
  compactBatch(turns: TurnRecord[]): void {
    if (turns.length === 0) return;

    const locations = new Set<string>();
    const npcs = new Set<string>();
    const events: string[] = [];

    for (const turn of turns) {
      if (turn.verb === 'move') locations.add('traveled');
      if (turn.dialogue) npcs.add(turn.dialogue.speaker);
      if (turn.verb === 'attack') events.push('combat');
      if (turn.verb === 'opportunity') events.push('opportunity');
    }

    const parts: string[] = [];
    if (locations.size > 0) parts.push('Traveled to new areas');
    if (npcs.size > 0) parts.push(`Spoke with ${[...npcs].join(', ')}`);
    if (events.length > 0) parts.push(`Events: ${[...new Set(events)].join(', ')}`);
    if (parts.length === 0) parts.push(`${turns.length} turns of exploration`);

    const summary = parts.join('. ') + '.';
    this._compactedChunks.push({
      fromTick: turns[0].tick,
      toTick: turns[turns.length - 1].tick,
      summary,
    });

    this.trimCompactedChunks();
  }

  /**
   * F-dfd125bb: bound _compactedChunks (and rebuild _compactedSummary from
   * it) at MAX_COMPACTED_CHUNKS, dropping the oldest chunk(s) first. Shared
   * by compactEvictedTurn(), compactBatch(), and fromJSON() so a save that
   * predates this cap self-heals on load instead of carrying its unbounded
   * growth forward.
   */
  private trimCompactedChunks(): void {
    while (this._compactedChunks.length > MAX_COMPACTED_CHUNKS) {
      this._compactedChunks.shift();
    }
    this._compactedSummary = this._compactedChunks
      .map((c) => c.summary)
      .join(' ');
  }

  /** Get chronicle highlights suitable for narrator long-term memory context. */
  getChronicleHighlights(): string | undefined {
    if (!this._compactedSummary) return undefined;
    return `[Long-term memory] ${this._compactedSummary}`;
  }

  getRecent(count = 6): TurnRecord[] {
    return this.turns.slice(-count);
  }

  getRecentNarration(count = 3): string[] {
    return this.turns.slice(-count).map((t) => t.narration);
  }

  getAll(): readonly TurnRecord[] {
    return this.turns;
  }

  clear(): void {
    this.turns = [];
    this._compactedSummary = '';
    this._compactedChunks = [];
  }

  toJSON(): { turns: TurnRecord[]; compactedChunks?: CompactedChunk[]; compactedSummary?: string } {
    return {
      turns: [...this.turns],
      compactedChunks: this._compactedChunks.length > 0 ? [...this._compactedChunks] : undefined,
      compactedSummary: this._compactedSummary || undefined,
    };
  }

  static fromJSON(data: TurnRecord[] | { turns: TurnRecord[]; compactedChunks?: CompactedChunk[]; compactedSummary?: string }, maxTurns = 50): TurnHistory {
    const history = new TurnHistory(maxTurns);

    // Support both legacy array format and new object format
    if (Array.isArray(data)) {
      history.turns = data.length > maxTurns ? data.slice(-maxTurns) : data;
    } else {
      history.turns = data.turns.length > maxTurns ? data.turns.slice(-maxTurns) : data.turns;
      if (data.compactedChunks) {
        history._compactedChunks = [...data.compactedChunks];
        // F-dfd125bb: apply the same cap on load as during live play, so a
        // save from before this cap existed self-heals immediately instead
        // of carrying its unbounded growth forward. Recomputes
        // _compactedSummary from the (possibly trimmed) chunks — for any
        // save produced by toJSON() that's the exact same string, since
        // it's the same join this class already used to build it.
        history.trimCompactedChunks();
      } else if (data.compactedSummary) {
        // No chunk breakdown to trim against (older/opaque format) —
        // preserve as-is; future compaction bounds growth from here on.
        history._compactedSummary = data.compactedSummary;
      }
    }

    return history;
  }
}
