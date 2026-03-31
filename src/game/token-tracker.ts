// FT-B-004: Token/cost tracking per LLM call type

export type CallType = 'interpretation' | 'narration' | 'dialogue' | 'other';

export type TokenRecord = {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
};

export type CostEstimate = {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
};

// Sonnet pricing: $3/MTok input, $15/MTok output
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

export class SessionTokenTracker {
  private records: Map<CallType, TokenRecord> = new Map();

  /** Record tokens from an LLM response. */
  record(callType: CallType, inputTokens: number, outputTokens: number): void {
    const existing = this.records.get(callType) ?? { inputTokens: 0, outputTokens: 0, callCount: 0 };
    existing.inputTokens += inputTokens;
    existing.outputTokens += outputTokens;
    existing.callCount += 1;
    this.records.set(callType, existing);
  }

  /** Get token record for a specific call type. */
  getRecord(callType: CallType): TokenRecord {
    return this.records.get(callType) ?? { inputTokens: 0, outputTokens: 0, callCount: 0 };
  }

  /** Get totals across all call types. */
  getTotals(): TokenRecord {
    let inputTokens = 0;
    let outputTokens = 0;
    let callCount = 0;
    for (const record of this.records.values()) {
      inputTokens += record.inputTokens;
      outputTokens += record.outputTokens;
      callCount += record.callCount;
    }
    return { inputTokens, outputTokens, callCount };
  }

  /** Estimate cost based on Sonnet pricing ($3/MTok input, $15/MTok output). */
  estimateCost(record?: TokenRecord): CostEstimate {
    const r = record ?? this.getTotals();
    const inputCostUsd = r.inputTokens * INPUT_COST_PER_TOKEN;
    const outputCostUsd = r.outputTokens * OUTPUT_COST_PER_TOKEN;
    return {
      inputCostUsd,
      outputCostUsd,
      totalCostUsd: inputCostUsd + outputCostUsd,
    };
  }

  /** Format a human-readable /cost summary. */
  formatCostSummary(): string {
    const lines: string[] = ['--- Session Token Usage ---'];
    const allTypes: CallType[] = ['interpretation', 'narration', 'dialogue', 'other'];
    for (const callType of allTypes) {
      const record = this.getRecord(callType);
      if (record.callCount === 0) continue;
      const cost = this.estimateCost(record);
      lines.push(
        `  ${callType}: ${record.callCount} calls, ${record.inputTokens} in / ${record.outputTokens} out (~$${cost.totalCostUsd.toFixed(4)})`,
      );
    }
    const totals = this.getTotals();
    const totalCost = this.estimateCost();
    lines.push('---');
    lines.push(
      `  Total: ${totals.callCount} calls, ${totals.inputTokens} in / ${totals.outputTokens} out`,
    );
    lines.push(`  Estimated cost: $${totalCost.totalCostUsd.toFixed(4)}`);
    return lines.join('\n');
  }

  /** Reset all tracked data. */
  reset(): void {
    this.records.clear();
  }
}
