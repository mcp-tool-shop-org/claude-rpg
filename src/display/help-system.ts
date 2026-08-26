// help-system — consolidated help rendering + pack onboarding
// v1.1: Campaign UX & Product Hardening

import type { ResolutionClass, ArcKind, ArcMomentum } from '@ai-rpg-engine/modules';
import { getTerminalWidth } from './play-renderer.js';
import { PLAY_COMMANDS } from '../cli/slash-completer.js';

// F-38eb3dec: both were a fixed 60-char divider regardless of terminal
// size, unlike play-renderer.ts's own dividers (PFE-005). Computed per
// call (not a module-level constant) so they track the real terminal
// width, matching play-renderer.ts's makeDivider()/makeThinDivider()
// pattern.
function divider(): string {
  return '\u2500'.repeat(getTerminalWidth());
}
function thinDivider(): string {
  return '\u00b7'.repeat(getTerminalWidth());
}

/**
 * Word-wrap `text` to `width` columns, never splitting a word. Always
 * returns at least one line, even when a single word exceeds `width` (left
 * unsplit rather than corrupted mid-word).
 */
function wrapWords(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

/**
 * F-d66603e9: renderArcHelp() and renderConcludeHelp() built their
 * two-column reference tables with a fixed name.padEnd(N) plus an unbounded
 * description on the same line. The surrounding dividers already adapt to
 * getTerminalWidth() (clamped 40-120, F-38eb3dec), but the table rows
 * between them didn't -- at a narrow terminal, a long description wrapped
 * wherever the terminal happened to break it, with no hanging indent, flush
 * against the left margin and visually indistinguishable from the next
 * entry's name. Shared helper: renders one "name, padded, then
 * word-wrapped description" row with a hanging indent under the name
 * column on every continuation line.
 */
function renderNameDescriptionRow(name: string, desc: string, nameWidth: number): string {
  const indent = '    ';
  const available = Math.max(10, getTerminalWidth() - indent.length - nameWidth);
  const wrapped = wrapWords(desc, available);
  const rows = [`${indent}${name.padEnd(nameWidth)}${wrapped[0]}`];
  for (let i = 1; i < wrapped.length; i++) {
    rows.push(`${indent}${' '.repeat(nameWidth)}${wrapped[i]}`);
  }
  return rows.join('\n');
}

// Exported for testing (matches play-renderer.ts's getTerminalWidth precedent).
export { wrapWords, renderNameDescriptionRow };

// --- Pack Onboarding Data ---

export type PackOnboarding = {
  quickstartTitle: string;
  flavorIntro: string;
  keyLeverageGuidance: string[];
  suggestedFirstMoves: string[];
  dangerWarning?: string;
};

// Exported (F-6c9e02d4) so a drift test can assert this map's key set
// stays in sync with packs.ts's allPacks ids -- the same "typed/derived
// against the real source" guard already applied to ARC_KIND_HELP and
// RESOLUTION_CLASS_LABELS elsewhere in this domain.
export const PACK_ONBOARDING: Record<string, PackOnboarding> = {
  'chapel-threshold': {
    quickstartTitle: 'Chapel Threshold Quickstart',
    flavorIntro: 'Sacred ground, corrupted below. The dead stir beneath crumbling stones.',
    keyLeverageGuidance: [
      'Favor earned from the Pilgrim opens doors',
      'Blackmail grows from discovering dark secrets',
      'High Heat draws undead attention — disguise to shed it',
      'Legitimacy unlocks Pilgrim cooperation',
    ],
    suggestedFirstMoves: [
      'talk to the pilgrim',
      'inspect the chapel nave',
      'bribe the pilgrim for safe passage',
    ],
    dangerWarning: 'The Ash Ghoul hits hard. Build Favor before descending.',
  },
  'neon-lockbox': {
    quickstartTitle: 'Neon Lockbox Quickstart',
    flavorIntro: 'Rain-slicked alleys, neon haze. Every connection is a transaction.',
    keyLeverageGuidance: [
      'Debt from the Fixer is your opening currency',
      'Seed rumors to destabilize corp security',
      'Sabotage ICE infrastructure to lower surveillance',
      'Negotiate access before brute-forcing locked zones',
    ],
    suggestedFirstMoves: [
      'talk to kira',
      'spread a rumor about corp security',
      'negotiate access with the syndicate',
    ],
    dangerWarning: 'ICE Sentries are lethal up close. Build intel first.',
  },
  'gaslight-detective': {
    quickstartTitle: 'Gaslight Detective Quickstart',
    flavorIntro: 'Fog-choked streets, locked rooms, and everyone has something to hide.',
    keyLeverageGuidance: [
      'Credibility matters more than brute force',
      'Pressure witnesses carefully — they clam up under heat',
      'Rumors can poison a case before facts arrive',
      'Legitimacy from institutions unlocks testimony',
    ],
    suggestedFirstMoves: [
      'inspect the parlour',
      'talk to the widow',
      'petition authority for an official investigation',
    ],
    dangerWarning: 'Accusation without evidence burns credibility permanently.',
  },
  'black-flag-requiem': {
    quickstartTitle: 'Black Flag Requiem Quickstart',
    flavorIntro: 'Your ship is your kingdom. The sea takes what it wants.',
    keyLeverageGuidance: [
      'Infamy opens doors and paints targets on your back',
      'Crew loyalty is fuel, not decoration — recruit allies',
      'Mutiny pressure is a real timer when cohesion drops',
      'Blackmail and intimidation rule the docks',
    ],
    suggestedFirstMoves: [
      'talk to the quartermaster',
      'intimidate the dock guard',
      'spread a rumor about rival captains',
    ],
    dangerWarning: 'Low crew cohesion triggers mutiny. Keep your allies close.',
  },
  'dust-devils-bargain': {
    quickstartTitle: "Dust Devil's Bargain Quickstart",
    flavorIntro: 'A haunted frontier town where the dead still draw and the law is whoever draws first.',
    keyLeverageGuidance: [
      'Legitimacy controls the frontier — the law is yours to shape',
      'Alliances are fragile; invest Favor to maintain them',
      'Heat brings bounty hunters faster than anywhere else',
      'Stake your claim early to establish dominance',
    ],
    suggestedFirstMoves: [
      'talk to the sheriff',
      'bribe the barkeep for information',
      'stake claim on the mining office',
    ],
    dangerWarning: 'The Revenant ignores social leverage. Prepare to fight.',
  },
  'ashfall-dead': {
    quickstartTitle: 'Ashfall Dead Quickstart',
    flavorIntro: 'Society has snapped in half. You decide who gets saved.',
    keyLeverageGuidance: [
      'Panic spreads faster than infection — bury bad rumors fast',
      'Trust is a resource — Favor with survivors keeps camp alive',
      'Wrong rumors can get people killed or trigger camp panic',
      'Diplomacy with rival survivors prevents resource wars',
    ],
    suggestedFirstMoves: [
      'talk to the medic',
      'inspect the barricade',
      'improve standing with the survivors',
    ],
    dangerWarning: 'Shamblers are slow. Runners are not. Check threat levels before exploring.',
  },
  'iron-colosseum': {
    quickstartTitle: 'Iron Colosseum Quickstart',
    flavorIntro: 'The crowd decides who is remembered. The sand decides who is buried.',
    keyLeverageGuidance: [
      'Crowd favor is currency — fight with style, not just to win',
      'Patron debts open doors the arena gate never will',
      'A rival spared today is a faction shifted tomorrow',
      'Glory fades; grudges compound',
    ],
    suggestedFirstMoves: ['look around', 'talk to the lanista', 'size up the other fighters'],
    dangerWarning: 'The arena forgives losses. The politics behind it do not.',
  },
  'jade-veil': {
    quickstartTitle: 'Jade Veil Quickstart',
    flavorIntro: 'Every word at court is a blade half-drawn. Sheathe yours carefully.',
    keyLeverageGuidance: [
      'Honor binds harder than chains — spend it deliberately',
      'A favor owed to the wrong house is a leash',
      'Silence in the right room speaks louder than steel',
      'Duels settle nothing the court has not already decided',
    ],
    suggestedFirstMoves: ['look around', 'greet the chamberlain', 'listen to the court gossip'],
    dangerWarning: 'Losing face can be deadlier than losing blood.',
  },
  'crimson-court': {
    quickstartTitle: 'Crimson Court Quickstart',
    flavorIntro: 'The court has fed for centuries. Tonight it wonders how you taste.',
    keyLeverageGuidance: [
      'Blood debts outlast mortal lifetimes — collect carefully',
      'Daylight is a wall; invitations are doors',
      'Every elder patron expects tribute in kind',
      'Mortal pawns are cheap; loyal ones are priceless',
    ],
    suggestedFirstMoves: ['look around', 'seek an audience with the elder', 'test the terms of hospitality'],
    dangerWarning: 'Hunger makes promises your standing cannot keep.',
  },
  'signal-loss': {
    quickstartTitle: 'Signal Loss Quickstart',
    flavorIntro: 'Something beneath the colony is listening. And it just started talking back.',
    keyLeverageGuidance: [
      'Corporate trust gates access to critical systems',
      'Blackmail from scanner readings unlocks investigation paths',
      'Sabotage on colony infrastructure has cascading consequences',
      'Influence derived from reputation determines who listens',
    ],
    suggestedFirstMoves: [
      'inspect the comms array',
      'talk to the science officer',
      'negotiate access with command',
    ],
    dangerWarning: 'The colony AI tracks everything. High surveillance means high risk.',
  },
};

export function getPackOnboarding(packId: string): PackOnboarding | undefined {
  return PACK_ONBOARDING[packId];
}

/**
 * Map genre to starter pack ID for first-turn onboarding. Exported
 * (F-6c9e02d4) for the same drift-test purpose as PACK_ONBOARDING above --
 * this map's values must stay a subset of packs.ts's allPacks ids.
 */
export const GENRE_TO_PACK: Record<string, string> = {
  fantasy: 'chapel-threshold',
  cyberpunk: 'neon-lockbox',
  detective: 'gaslight-detective',
  pirate: 'black-flag-requiem',
  'weird-west': 'dust-devils-bargain',
  zombie: 'ashfall-dead',
  colony: 'signal-loss',
  gladiator: 'iron-colosseum',
  ronin: 'jade-veil',
  vampire: 'crimson-court',
};

/** Get onboarding data by genre (for first-turn guidance). */
export function getOnboardingByGenre(genre: string): PackOnboarding | undefined {
  const packId = GENRE_TO_PACK[genre];
  return packId ? PACK_ONBOARDING[packId] : undefined;
}

/**
 * F-ed5f7d25: getOnboardingByGenre() looks up GENRE_TO_PACK by the runtime
 * `genre` value (pack.meta.genres[0]) -- but GENRE_TO_PACK's keys are the 10
 * pack-family names, a different, independent taxonomy than
 * PackMetadata.genres. Live-verified: only 3 of 10 registered packs have a
 * genres[0] matching their GENRE_TO_PACK key; the other 7 silently render no
 * onboarding card, and two pairs (iron-colosseum/jade-veil, both
 * 'historical'; ashfall-dead/crimson-court, both 'horror') even collide on
 * the same genres[0] string, so genre alone can never disambiguate every
 * pack -- a fix that only patched GENRE_TO_PACK's keys would still drop one
 * pack per collision.
 *
 * This is the correct replacement lookup: prefer the real pack id (
 * PACK_ONBOARDING is keyed directly by packId, so this path resolves all 10
 * packs by construction -- no taxonomy mismatch possible) and fall back to
 * the lossy genre lookup only when no packId is available at all (e.g. a
 * custom `claude-rpg new "<prompt>"` world, which has no registered pack).
 *
 * CROSS-DOMAIN REMAINDER: the only production call site
 * (src/game/game-presenter.ts's renderOpeningOutput, game-core's owned
 * glob) still calls getOnboardingByGenre(genre) directly and has no packId
 * parameter to receive -- GameConfig (src/game.ts, also game-core) has no
 * packId field yet either. Wiring the real call site to this function
 * requires a game-core change outside cli-display's edit scope this wave
 * (see wave-14 output notes). bin.ts already has the real packId at both of
 * its call sites (result.pack.meta.id for new games, savedSession.packId
 * for loaded games), ready to thread through the moment GameConfig accepts
 * it.
 */
export function getOnboardingForSession(packId: string | undefined, genre: string): PackOnboarding | undefined {
  if (packId) {
    const byId = getPackOnboarding(packId);
    if (byId) return byId;
  }
  return getOnboardingByGenre(genre);
}

/** Render compact first-turn orientation from pack onboarding data. */
export function renderFirstTurnOrientation(data: PackOnboarding): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(thinDivider());
  lines.push(`  ${data.flavorIntro}`);
  lines.push('');
  lines.push('  TRY:');
  for (const move of data.suggestedFirstMoves) {
    lines.push(`    > ${move}`);
  }
  if (data.dangerWarning) {
    lines.push(`  WARNING: ${data.dangerWarning}`);
  }
  lines.push(`  Type /help for commands, /help leverage for social verbs.`);
  lines.push('');
  return lines.join('\n');
}

// --- Play Mode Help ---

export function renderPlayHelp(): string {
  // F-1036ff43: derived from PLAY_COMMANDS (slash-completer.ts) instead of
  // hand-listed, so this screen can't drift back down to a fraction of the
  // real command set the way it did before (5 of 12+ commands documented).
  // '/help' is excluded here -- it's documented just above via its four
  // subcommand rows instead of a single generic line.
  const commandRows = PLAY_COMMANDS
    .filter((c) => c.cmd !== '/help')
    .map((c) => `    ${c.cmd.padEnd(30)}${c.description}`)
    .join('\n');

  return `
${divider()}
  QUICK REFERENCE
${divider()}

  BASIC ACTIONS
    look / inspect <target>       Examine your surroundings or a target
    go / move <place>             Move to a neighboring zone
    talk / speak <npc>            Start a conversation
    attack <target>               Engage in combat
    use <item>                    Use an inventory item

  LEVERAGE ACTIONS
    bribe <target>                Spend Favor for cooperation
    intimidate <target>           Threaten for compliance (costs Heat)
    recruit <target>              Recruit an ally (Favor + Influence)
    disguise                      Shed Heat and lower alert
    spread rumor about <faction>  Seed a rumor (costs Influence)
    deny rumor                    Counter a harmful rumor (Legitimacy)
    negotiate access <faction>    Open restricted doors (Favor + Legitimacy)
    sabotage <target>             Destabilize infrastructure (Blackmail + Heat)

  COMMANDS
    /help                         This reference
    /help leverage                Full leverage verb reference
    /help arcs                    Campaign arc kinds and momentum
    /help conclude                Endgame triggers and epilogue
    /help <pack-id>               Pack-specific quickstart guide
${commandRows}

${divider()}
`;
}

// --- Leverage Help ---

export function renderLeverageHelp(): string {
  return `
${divider()}
  LEVERAGE REFERENCE
${divider()}

  CURRENCIES (0-100)
    Favor        Earned from positive reputation, resolved pressures, speaking
    Debt         Accumulated from calling in favors, repaid by helping factions
    Blackmail    From inspecting faction members, discoveries, investigation
    Influence    Derived from your highest faction reputation (not stored)
    Heat         From hostile actions. Decays 3/turn. High Heat triggers hunts
    Legitimacy   From milestones, title evolution, resolving official pressures

  SOCIAL VERBS                         Cost                    CD
    bribe <target>                     Favor: 15               3
    intimidate <target>                Heat: 10                3
    call in favor                      Debt: 20, Favor: 10    5
    recruit <target>                   Favor: 25, Infl: 15    5
    petition authority                 Legit: 20               4
    disguise                           Infl: 5                 5
    stake claim                        Infl: 30, Legit: 20    8

  RUMOR VERBS                          Cost                    CD
    spread rumor / seed                Infl: 10                3
    deny rumor                         Legit: 10               2
    frame <target>                     Blkml: 20, Heat: 15    5
    claim false credit                 Infl: 15                4
    bury scandal                       Favor: 15, Infl: 10    4
    leak truth                         Blkml: 15               3
    spread counter-rumor               Infl: 10, Heat: 5      3

  DIPLOMACY VERBS                      Cost                    CD
    request meeting <faction>          Favor: 5                2
    improve standing <faction>         Favor: 20               4
    cash milestone                     (free)                  5
    negotiate access <faction>         Favor: 15, Legit: 10   5
    trade secret                       Blkml: 15               4
    temporary alliance <faction>       Favor: 25, Infl: 20    8
    broker truce                       Infl: 30, Legit: 15    5

  SABOTAGE VERBS                       Cost                    CD
    sabotage <target>                  Blkml: 10, Heat: 20    5
    plant evidence <target>            Blkml: 20, Heat: 15    5
    blackmail <target>                 Blkml: 25               5

  SCARCITY RULES
    Max 1 leverage action per turn
    Heat > 50 triggers faction investigations
    Heat > 80 risks bounty pressure
    Some actions require minimum reputation with target faction

${divider()}
`;
}

// --- Pack Quickstart Card ---

export function renderPackQuickstart(packId: string): string {
  const data = PACK_ONBOARDING[packId];
  if (!data) {
    const available = Object.keys(PACK_ONBOARDING).join(', ');
    return `  Unknown pack: "${packId}". Available: ${available}`;
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(divider());
  lines.push(`  ${data.quickstartTitle.toUpperCase()}`);
  lines.push(divider());
  lines.push('');
  lines.push(`  ${data.flavorIntro}`);
  lines.push('');
  lines.push('  LEVERAGE TIPS');
  for (const tip of data.keyLeverageGuidance) {
    lines.push(`    - ${tip}`);
  }
  lines.push('');
  lines.push('  TRY THESE');
  for (const move of data.suggestedFirstMoves) {
    lines.push(`    > ${move}`);
  }
  if (data.dangerWarning) {
    lines.push('');
    lines.push(`  WARNING: ${data.dangerWarning}`);
  }
  lines.push('');
  lines.push(divider());
  lines.push('');
  return lines.join('\n');
}

// --- Arc Help ---

/**
 * One-line description per arc kind, typed against the engine's real enum
 * (@ai-rpg-engine/modules ArcKind, arc-detection.d.ts) — the same fix
 * F-545cb684 applied to RESOLUTION_CLASS_HELP for the identical bug next
 * door. Before this (F-204465a3), renderArcHelp hand-listed 10 kinds
 * (rising-power, hunted, kingmaker, resistance, merchant-prince,
 * shadow-broker, peacemaker, outcast, revelation, betrayer) as untyped
 * prose; only the first 6 are real. The other 4 real kinds — last-stand,
 * community-builder, descent, reckoning — went undocumented. Descriptions
 * for those 4 are grounded in arc-detection.js's actual scoring signals
 * (low HP/companions/high heat for last-stand; companion morale/legitimacy/
 * allied NPCs for community-builder; falling reputation/rising heat/losing
 * companions for descent; NPC obligation load + converging pressures for
 * reckoning), not guessed.
 */
export const ARC_KIND_HELP: Record<ArcKind, string> = {
  'rising-power': 'Growing faction influence, territory, political capital',
  'hunted': 'Multiple factions hostile, bounties, allies turning',
  'kingmaker': 'Holding balance of power between competing factions',
  'resistance': 'Fighting dominant faction from a weaker position',
  'merchant-prince': 'Economic dominance through trade and resources',
  'shadow-broker': 'Intel accumulation, hidden influence, rumor networks',
  'last-stand': 'Low health, mounting pressures, allies dwindling',
  'community-builder': 'Loyal companions, legitimacy, and allies anchoring stability',
  'descent': 'Falling reputation, rising heat, companions and standing slipping',
  'reckoning': 'Mounting obligations and converging pressures forcing a confrontation',
};

/**
 * The three real momentum values (@ai-rpg-engine/modules ArcMomentum). The
 * old prose said "rising, steady, or fading" — only 'steady' ever matched;
 * the real values are building/steady/waning (F-204465a3).
 */
export const ARC_MOMENTUM_HELP: Record<ArcMomentum, string> = {
  'building': 'building',
  'steady': 'steady',
  'waning': 'waning',
};

/** "a, b, or c" — derived, not hardcoded, so a future 4th momentum value
 *  (or kind) added to the map still renders correctly. */
function joinWithOr(items: string[]): string {
  if (items.length <= 1) return items.join(', ');
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

export function renderArcHelp(): string {
  const kindLines = Object.entries(ARC_KIND_HELP)
    .map(([kind, desc]) => renderNameDescriptionRow(kind, desc, 20))
    .join('\n');
  const momentumList = joinWithOr(Object.keys(ARC_MOMENTUM_HELP));

  return `
${divider()}
  CAMPAIGN ARCS
${divider()}

  The engine tracks 10 narrative arc kinds based on your actions:

${kindLines}

  Each arc signal has momentum: ${momentumList}.
  Your dominant arc shapes endgame triggers and the campaign epilogue.

  COMMANDS
    /arcs              View your current arc trajectory
    /status            See arc indicator in strategic snapshot

${divider()}
`;
}

// --- Conclude Help ---

/**
 * One-line description per resolution class, typed against the engine's
 * real enum (@ai-rpg-engine/modules ResolutionClass) — the same source
 * archive-browser.ts's RESOLUTION_CLASS_LABELS is typed against — so this
 * list can't drift from what /conclude actually produces the way the old
 * hand-typed prose did (F-545cb684: it named corruption/revelation/
 * stalemate/exodus, none of which the engine has ever produced).
 */
const RESOLUTION_CLASS_HELP: Record<ResolutionClass, string> = {
  'victory': 'Dominant faction control with high stability',
  'exile': 'Expelled from all territories, no allies',
  'martyrdom': 'Death in service of a cause, legacy intact',
  'collapse': 'Districts and factions splinter beyond repair',
  'overthrow': 'Faction leadership change driven by you',
  'puppet-master': 'Hidden influence — you pull strings unseen',
  'quiet-retirement': 'Threats resolved, legitimacy earned, peace holds',
  'tragic-stabilization': 'Stability at great cost, forgotten by history',
};

export function renderConcludeHelp(): string {
  const classLines = Object.entries(RESOLUTION_CLASS_HELP)
    .map(([cls, desc]) => renderNameDescriptionRow(cls, desc, 23))
    .join('\n');

  return `
${divider()}
  CAMPAIGN CONCLUSIONS
${divider()}

  When your story reaches critical mass, endgame triggers fire.
  These are one-shot pivotal moments based on 8 resolution classes:

${classLines}

  When triggers appear, you'll see contextual hints.
  Type /conclude to render your campaign epilogue.

  The epilogue is grounded in simulation truth — faction fates,
  NPC outcomes, district conditions, and your legacy are computed
  deterministically, then narrated by Claude.

  COMMANDS
    /conclude          Render campaign epilogue (when triggers present)
    /arcs              View arc trajectory leading to conclusion

${divider()}
`;
}

// --- Director Help Extended ---

export function renderDirectorHelpExtended(subcommand: string): string {
  switch (subcommand.toLowerCase()) {
    case 'leverage':
      return renderLeverageHelp();
    case 'arcs':
      return renderArcHelp();
    case 'conclude':
    case 'conclusion':
    case 'conclusions':
    case 'finale':
      return renderConcludeHelp();
    default: {
      // Check if it's a pack ID
      const pack = PACK_ONBOARDING[subcommand.toLowerCase()];
      if (pack) return renderPackQuickstart(subcommand.toLowerCase());
      return `  Unknown help topic: "${subcommand}". Try: leverage, arcs, conclude, or a pack id.`;
    }
  }
}
