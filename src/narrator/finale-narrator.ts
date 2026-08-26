// Finale narrator: LLM epilogue generation grounded in FinaleOutline
// v2.0: hybrid finale — deterministic outline + optional prose epilogue

import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { formatFinaleForTerminal } from '@ai-rpg-engine/campaign-memory';
import type { ClaudeClient } from '../claude-client.js';
import { FINALE_SYSTEM, buildFinalePrompt } from '../prompts/finale-prompt.js';
import { NarrationError } from '../llm/claude-errors.js';
import { classifyError } from '../llm/claude-adapter.js';

export type FinaleNarrationResult = {
  epilogue: string;
  deterministicSummary: string;
  worldAfter: string;
};

/** Generate a full finale: deterministic summary + LLM epilogue prose. */
export async function narrateFinale(
  client: ClaudeClient,
  outline: FinaleOutline,
  genre: string,
  playerName?: string,
): Promise<FinaleNarrationResult> {
  const deterministicSummary = formatFinaleForTerminal(outline);

  let epilogue: string;
  try {
    const userPrompt = buildFinalePrompt(outline, genre, playerName);
    const result = await client.generate({
      system: FINALE_SYSTEM,
      prompt: userPrompt,
      maxTokens: 400,
    });
    epilogue = result.text.trim();
  } catch (err) {
    // F-6480985e: domain-wide fatal-error contract (documented in claude-errors.ts
    // near NarrationError.fatal) — fatal (auth/bad-request) errors rethrow so
    // bin.ts's presentError renders the structured system-level box, matching
    // narrator.ts's narrateScene/narrateSceneLegacy. Surfacing userMessage() as
    // the epilogue text (the old behavior) made a bad API key indistinguishable
    // from authored campaign prose. Non-fatal kinds keep the deterministic-only
    // fallback (blank epilogue; the real summary/world-after still render).
    const narrationErr = err instanceof NarrationError ? err : classifyError(err);
    if (narrationErr.fatal) throw narrationErr;
    console.warn(
      `[finale-narrator] LLM epilogue generation failed: ${narrationErr.message}. Falling back to deterministic summary only.`,
    );
    epilogue = '';
  }

  const worldAfter = buildWorldAfter(outline);

  return { epilogue, deterministicSummary, worldAfter };
}

/** Compact glanceable "world after" snapshot — max ~10 lines. */
function buildWorldAfter(outline: FinaleOutline): string {
  const lines: string[] = [];
  lines.push('  ═══ WORLD AFTER ═══');

  if (outline.factionFates.length > 0) {
    const factions = outline.factionFates
      .map((f) => `${f.factionId} (${f.outcome})`)
      .join(' · ');
    lines.push(`  Factions:    ${factions}`);
  }

  if (outline.districtFates.length > 0) {
    const districts = outline.districtFates
      .map((d) => `${d.name} (${d.stability}/${d.economyTone})`)
      .join(' · ');
    lines.push(`  Districts:   ${districts}`);
  }

  if (outline.companionFates.length > 0) {
    const companions = outline.companionFates
      .map((c) => `${c.name} (${c.outcome})`)
      .join(' · ');
    lines.push(`  Companions:  ${companions}`);
  }

  // Relics from legacy entries with high significance
  const relics = outline.legacy
    .filter((l) => l.significance >= 0.8)
    .slice(0, 4)
    .map((l) => l.label);
  if (relics.length > 0) {
    lines.push(`  Relics:      ${relics.join(' · ')}`);
  }

  lines.push(`  Resolution:  ${outline.resolutionClass}${outline.dominantArc ? ` (${outline.dominantArc} arc)` : ''}`);
  lines.push(`  Duration:    ${outline.campaignDuration} turns`);

  return lines.join('\n');
}
