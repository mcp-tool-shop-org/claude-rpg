import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'Claude RPG',
  description: 'Simulation-grounded campaign RPG where Claude stages the story, the engine preserves truth, and worlds evolve toward meaningful conclusions',
  logoBadge: 'CR',
  brandName: 'Claude RPG',
  repoUrl: 'https://github.com/mcp-tool-shop-org/claude-rpg',
  npmUrl: 'https://www.npmjs.com/package/claude-rpg',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: 'Terminal RPG',
    headline: 'Claude narrates.',
    headlineAccent: 'The engine owns truth.',
    description: 'A simulation-grounded campaign RPG where Claude stages the story, the engine preserves truth, and worlds evolve through rumor, pressure, faction, relationship, economy, and arc systems toward meaningful conclusions.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Play', code: 'npx claude-rpg play --world fantasy' },
      { label: 'Generate', code: 'npx claude-rpg new "A flooded gothic trade city"' },
      { label: 'Archive', code: 'npx claude-rpg archive' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Simulation-first design',
      subtitle: 'Every turn runs through a deterministic simulation before Claude narrates the result.',
      features: [
        {
          title: 'Deterministic truth',
          desc: 'The engine resolves combat, movement, and dialogue. Claude only narrates what the perception layer allows the player to see. No hallucinated outcomes.',
        },
        {
          title: 'NPC agency',
          desc: 'NPCs act on goals, track obligations, and retaliate when loyalty breakpoints shift. Consequence chains ripple across factions and districts.',
        },
        {
          title: 'Campaign arcs',
          desc: '10 arc kinds detected from accumulated state. 8 endgame resolution classes trigger when thresholds are crossed. Deterministic finale rendering with LLM epilogue.',
        },
        {
          title: 'Living districts',
          desc: 'Commerce, morale, and safety shift from player actions, faction moves, and NPC consequence chains. District mood flows into narration.',
        },
        {
          title: 'Player leverage',
          desc: 'Spend influence, favors, and intel on social, rumor, diplomacy, and sabotage actions. Strategic map analysis and move advisor guide political play.',
        },
        {
          title: 'Equipment provenance',
          desc: 'Items carry history. A sword that kills enough becomes a relic with an epithet. NPCs recognize equipped items and react to their reputation.',
        },
        {
          title: 'Campaign archives',
          desc: 'Browse completed campaigns, export chronicles as markdown or JSON, and share standalone finale documents. Every campaign leaves a record.',
        },
        {
          title: 'Streaming narration',
          desc: 'Text arrives incrementally at the terminal. The engine resolves first — streaming is presentation only. Interrupted streams cannot corrupt game state.',
        },
        {
          title: 'Runtime-proofed',
          desc: '302 tests across 24 test files covering turn-loop integration, save migration, streaming, chronicle continuity, NPC agency, narration, and coverage floors. Typed contracts eliminate field miswires at compile time.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Quick start',
      cards: [
        {
          title: 'Install and play',
          code: '# Install globally\nnpm install -g claude-rpg\n\n# Set your API key\nexport ANTHROPIC_API_KEY=sk-ant-...\n\n# Play a starter world\nclaude-rpg play --world fantasy',
        },
        {
          title: 'Generate a custom world',
          code: '# Create a world from any prompt\nclaude-rpg new "A flooded gothic trade city\n  ruled by three merchant houses"\n\n# Load a saved game\nclaude-rpg load',
        },
      ],
    },
    {
      kind: 'data-table',
      id: 'worlds',
      title: '10 starter worlds',
      subtitle: 'Each world comes with factions, NPCs, districts, and genre-specific modules.',
      columns: ['World', 'Genre', 'Theme'],
      rows: [
        ['Chapel Threshold', 'Fantasy', 'A mountain monastery under siege by the faithful and the fallen'],
        ['Neon Lockbox', 'Cyberpunk', 'Corporate arcology where data is currency and trust is a weapon'],
        ['Gaslight Detective', 'Detective', 'Victorian streets hiding a conspiracy that reaches the crown'],
        ['Black Flag Requiem', 'Pirate', 'A dying pirate republic choosing between freedom and survival'],
        ['Ashfall Dead', 'Zombie', 'Post-outbreak colony where the living are more dangerous than the dead'],
        ["Dust Devil's Bargain", 'Weird West', 'Frontier town where every deal has a supernatural catch'],
        ['Signal Loss', 'Sci-Fi Colony', 'Deep space colony that lost contact with Earth three years ago'],
        ['Iron Colosseum', 'Gladiator', 'Arena politics where every fight is a transaction and every champion has a patron'],
        ['Jade Veil', 'Ronin', 'A masterless warrior navigating clan feuds in a land where honor is currency'],
        ['Crimson Court', 'Vampire', 'Immortal aristocrats scheming through centuries of debt, blood, and betrayal'],
      ],
    },
    {
      kind: 'features',
      id: 'modes',
      title: 'Three modes',
      subtitle: 'Play, inspect, or replay.',
      features: [
        {
          title: 'Play mode',
          desc: 'Immersive narrated RPG. Type freeform text, explore, fight, negotiate, scheme. Perception filtering means you only see what your character perceived.',
        },
        {
          title: 'Director mode',
          desc: 'Inspect hidden simulation truth. See NPC beliefs, faction cognition, rumor networks, obligation ledgers, and consequence chains. Understand exactly why things happened.',
        },
        {
          title: 'Campaign conclusions',
          desc: 'Arc detection tracks your trajectory. Endgame triggers fire at pivotal moments. /conclude renders a structured epilogue with faction fates, NPC outcomes, and your legacy.',
        },
      ],
    },
  ],
};
