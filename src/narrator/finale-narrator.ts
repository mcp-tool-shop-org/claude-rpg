// Finale narrator: LLM epilogue generation grounded in FinaleOutline
// v2.0: hybrid finale — deterministic outline + optional prose epilogue

import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { formatFinaleForTerminal } from '@ai-rpg-engine/campaign-memory';
import type { ClaudeClient } from '../claude-client.js';
import { FINALE_SYSTEM, buildFinalePrompt } from '../prompts/finale-prompt.js';

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
  } catch {
    // Fallback: no LLM epilogue, just the deterministic summary
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
