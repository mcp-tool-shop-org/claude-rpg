// Turn history: rolling context window for narration continuity

export type TurnRecord = {
  tick: number;
  playerInput: string;
  verb: string;
  narration: string;
  dialogue?: { speaker: string; text: string };
};

export class TurnHistory {
  private turns: TurnRecord[] = [];
  private maxTurns: number;

  constructor(maxTurns = 50) {
    this.maxTurns = maxTurns;
  }

  record(turn: TurnRecord): void {
    this.turns.push(turn);
    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }
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
  }

  toJSON(): TurnRecord[] {
    return [...this.turns];
  }

  static fromJSON(data: TurnRecord[]): TurnHistory {
    const history = new TurnHistory();
    history.turns = data;
    return history;
  }
}
