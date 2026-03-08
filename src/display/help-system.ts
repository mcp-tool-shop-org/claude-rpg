// help-system — consolidated help rendering + pack onboarding
// v1.1: Campaign UX & Product Hardening

const DIVIDER = '\u2500'.repeat(60);
const THIN = '\u00b7'.repeat(60);

// --- Pack Onboarding Data ---

export type PackOnboarding = {
  quickstartTitle: string;
  flavorIntro: string;
  keyLeverageGuidance: string[];
  suggestedFirstMoves: string[];
  dangerWarning?: string;
};

const PACK_ONBOARDING: Record<string, PackOnboarding> = {
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

/** Map genre to starter pack ID for first-turn onboarding. */
const GENRE_TO_PACK: Record<string, string> = {
  fantasy: 'chapel-threshold',
  cyberpunk: 'neon-lockbox',
  detective: 'gaslight-detective',
  pirate: 'black-flag-requiem',
  'weird-west': 'dust-devils-bargain',
  zombie: 'ashfall-dead',
  colony: 'signal-loss',
};

/** Get onboarding data by genre (for first-turn guidance). */
export function getOnboardingByGenre(genre: string): PackOnboarding | undefined {
  const packId = GENRE_TO_PACK[genre];
  return packId ? PACK_ONBOARDING[packId] : undefined;
}

/** Render compact first-turn orientation from pack onboarding data. */
export function renderFirstTurnOrientation(data: PackOnboarding): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(THIN);
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
  return `
${DIVIDER}
  QUICK REFERENCE
${DIVIDER}

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
    /status                       Strategic snapshot
    /arcs                         View arc trajectory
    /conclude                     Render campaign epilogue
    /sheet                        Character sheet
    /director                     Enter director mode

${DIVIDER}
`;
}

// --- Leverage Help ---

export function renderLeverageHelp(): string {
  return `
${DIVIDER}
  LEVERAGE REFERENCE
${DIVIDER}

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

${DIVIDER}
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
  lines.push(DIVIDER);
  lines.push(`  ${data.quickstartTitle.toUpperCase()}`);
  lines.push(DIVIDER);
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
  lines.push(DIVIDER);
  lines.push('');
  return lines.join('\n');
}

// --- Arc Help ---

export function renderArcHelp(): string {
  return `
${DIVIDER}
  CAMPAIGN ARCS
${DIVIDER}

  The engine tracks 10 narrative arc kinds based on your actions:

    rising-power       Growing faction influence, territory, political capital
    hunted             Multiple factions hostile, bounties, allies turning
    kingmaker          Holding balance of power between competing factions
    resistance         Fighting dominant faction from a weaker position
    merchant-prince    Economic dominance through trade and resources
    shadow-broker      Intel accumulation, hidden influence, rumor networks
    peacemaker         Resolving conflicts, building alliances
    outcast            Rejected by all factions, operating independently
    revelation         Uncovering hidden truths, following belief chains
    betrayer           Breaking alliances, abandoning obligations

  Each arc signal has momentum: rising, steady, or fading.
  Your dominant arc shapes endgame triggers and the campaign epilogue.

  COMMANDS
    /arcs              View your current arc trajectory
    /status            See arc indicator in strategic snapshot

${DIVIDER}
`;
}

// --- Conclude Help ---

export function renderConcludeHelp(): string {
  return `
${DIVIDER}
  CAMPAIGN CONCLUSIONS
${DIVIDER}

  When your story reaches critical mass, endgame triggers fire.
  These are one-shot pivotal moments based on 8 resolution classes:

    victory            Dominant faction control with high stability
    exile              Expelled from all territories, no allies
    overthrow          Faction leadership change driven by you
    martyrdom          Sacrifice for a cause (high influence spent)
    corruption         Power gained through betrayal and manipulation
    revelation         Major hidden truth exposed to all factions
    stalemate          All factions locked in unresolvable tension
    exodus             Abandoning the setting entirely

  When triggers appear, you'll see contextual hints.
  Type /conclude to render your campaign epilogue.

  The epilogue is grounded in simulation truth — faction fates,
  NPC outcomes, district conditions, and your legacy are computed
  deterministically, then narrated by Claude.

  COMMANDS
    /conclude          Render campaign epilogue (when triggers present)
    /arcs              View arc trajectory leading to conclusion

${DIVIDER}
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
