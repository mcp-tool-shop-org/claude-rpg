<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/claude-rpg"><img src="https://img.shields.io/npm/v/claude-rpg.svg" alt="version npm"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="Licence : MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Page d'accueil"></a>
</p>

# Claude RPG

Un RPG en terminal ancré dans la simulation, où Claude narre, le moteur préserve la vérité, et le runtime d'immersion orchestre la voix, le son et la présentation.

## Qu'est-ce que Claude RPG ?

Claude RPG repose sur le [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — un runtime de simulation déterministe comprenant 29 modules couvrant le combat, la cognition, la perception, les factions, les rumeurs, la provenance des croyances, l'autonomie des PNJ, les compagnons, l'influence du joueur, les cartes stratégiques, la reconnaissance d'objets, la provenance de l'équipement, les opportunités émergentes, la détection d'arcs narratifs et les déclencheurs de fin de partie. Le rôle de Claude est d'interpréter, narrer et parler. Le rôle du moteur est de posséder la vérité.

La règle d'or : **Claude propose, le moteur dispose.**

Les joueurs tapent du texte libre. Claude interprète l'intention, le moteur résout les actions de manière déterministe, les filtres de perception décident ce que le joueur a réellement vu, puis Claude narre uniquement ce que le personnage a perçu — avec la voix, les effets sonores et l'audio ambiant orchestrés par le runtime d'immersion.

Les PNJ ne récitent pas de scripts. Ils s'expriment à partir de leurs croyances, souvenirs, loyauté de faction et rumeurs. Ils mentent pour des raisons précises. Ils doutent pour des raisons précises. Ils refusent pour des raisons précises. Le mode Directeur vous permet d'inspecter exactement pourquoi.

## Installation

```bash
npm install claude-rpg
```

Ou exécuter directement :

```bash
npx claude-rpg play --world fantasy
```

## Démarrage rapide

```bash
# Jouer le scénario intégré Chapel Threshold
npx claude-rpg play --world fantasy

# Générer un nouveau monde à partir d'un prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

Définissez votre clé API Anthropic :

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Ce qui le rend différent

| Quoi | Comment |
|------|---------|
| **Vérité de la simulation séparée de la narration** | Le moteur résout le combat, les déplacements, les dialogues — Claude ne fait que narrer le résultat. Aucun résultat halluciné. |
| **Dialogues des PNJ ancrés dans la cognition** | Chaque réplique de PNJ est construite à partir de ses croyances, souvenirs, moral, suspicion, faction et rumeurs. |
| **Présentation consciente de la perception** | Claude ne reçoit que ce que le personnage joueur a perçu. Les entités à faible clarté apparaissent comme des silhouettes, pas comme des cibles nommées. |
| **Runtime d'immersion audio/voix** | Des plans de narration structurés pilotent la synthèse vocale, les effets sonores, les couches ambiantes et la musique via voice-soundboard. |
| **Visibilité du Directeur sur la vérité cachée** | `/inspect pilgrim` affiche les croyances. `/trace` affiche la provenance. `/divergences` montre ce que vous pensiez qu'il s'était passé par rapport à ce qui s'est réellement passé. |
| **Autonomie des PNJ avec chaînes de conséquences** | Les PNJ agissent selon leurs objectifs, suivent leurs obligations et ripostent lorsque les seuils de loyauté basculent. `/npc` et `/people` révèlent les points de rupture, les leviers d'influence et les chaînes de conséquences actives. |
| **Quartiers vivants** | Les quartiers ont un commerce, un moral et une sécurité qui évoluent selon les actions du joueur, les manœuvres des factions et les chaînes de conséquences des PNJ. L'ambiance se répercute dans la narration et adapte le gameplay. `/districts` et `/district` inspectent le pouls du quartier. |
| **Compagnons avec risque de départ** | Les membres du groupe ont un moral, une loyauté et des déclencheurs de départ. Poussez-les trop loin et ils partent — pour des raisons que le moteur enregistre. |
| **Influence du joueur et action politique** | Dépensez de l'influence, des faveurs et du renseignement pour des actions sociales, de rumeur, diplomatiques et de sabotage. `/leverage` affiche votre capital politique. |
| **Provenance de l'équipement et reliques** | Les objets portent une histoire. Une épée qui tue suffisamment devient une relique avec un épithète. Les PNJ reconnaissent les objets équipés et réagissent. `/item` inspecte la provenance et les chroniques. |
| **Opportunités émergentes** | Contrats, primes, faveurs, missions d'approvisionnement et enquêtes apparaissent selon les conditions du monde — pression, pénurie, objectifs des PNJ, obligations. Accepter, refuser, abandonner ou trahir. `/jobs` et `/accepted` suivent les travaux disponibles et en cours. |
| **Arcs narratifs et fins de partie** | Le moteur détecte 10 types d'arcs narratifs (montée en puissance, traqué, faiseur de rois, résistance, etc.) et 8 classes de résolution de fin de partie (victoire, exil, renversement, martyre, etc.) à partir de l'état accumulé. `/arcs` affiche la trajectoire. `/conclude` génère un épilogue structuré avec narration LLM optionnelle. |

## Architecture

```
Le joueur tape du texte libre
    |
[1] INTERPRÉTATION DE L'ACTION (Claude)
    Entrée : texte du joueur + verbes + entités + sorties
    Sortie : { verb, targetIds, confidence }
    |
[2] RÉSOLUTION DU MOTEUR (déterministe)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] FILTRAGE DE PERCEPTION (déterministe)
    presentForObserver() -> ce que le joueur a vu
    |
[4] HOOKS : pré-narration
    Ambiance de zone, alertes de combat, effets de mort
    |
[5] PLAN DE NARRATION (Claude)
    Entrée : scène filtrée + état de présentation
    Sortie : NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] DIRECTEUR AUDIO
    Priorité, ducking, cooldowns -> AudioCommand[]
    |
[7] PRÉSENTATION
    Synthèse vocale + SFX + ambiance via voice-soundboard
    Rendu texte dans le terminal
    |
[8] DIALOGUE PNJ (Claude, si un PNJ parle)
    Ancré dans la cognition : croyances, souvenirs, faction, rumeurs
    Voix attribuée par PNJ
```

## Runtime d'immersion (v0.2)

Le narrateur ne produit pas de la prose brute — il produit un **NarrationPlan** : une recette structurée décrivant le texte, les effets sonores, les couches ambiantes, les signaux musicaux et les paramètres vocaux.

| Module | Fonction |
|--------|----------|
| **Machine à états de présentation** | Suit exploration / dialogue / combat / après-combat — pilote la sélection des couches audio |
| **Cycle de vie des hooks** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — injectent de l'audio contextuel |
| **Assignation vocale** | Associe automatiquement les PNJ aux voix [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) par type, genre, faction |
| **Directeur audio** | Planifie les signaux avec priorité, ducking, cooldowns, anti-spam |
| **Registre sonore** | Entrées audio adressables par contenu — recherche par tags, ambiance, intensité |
| **Pont MCP** | Traduit les AudioCommands en appels d'outils voice-soundboard |

## Trois modes

| Mode | Ce qu'il fait |
|------|---------------|
| **Play** | RPG narré immersif. Claude narre, les PNJ parlent à partir de leurs croyances, les actions sont résolues par le moteur. |
| **Director** | Inspecter la vérité cachée : `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Parcourir la chronologie des événements en affichant la vérité objective et la perception du joueur côte à côte. |

## Paquets du moteur

Claude RPG dépend de ces paquets [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) :

| Paquet | Fonction |
|--------|----------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | État, entités, actions, événements, règles, RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 modules — combat, cognition, perception, factions, rumeurs, autonomie des PNJ, compagnons, influence, carte stratégique, reconnaissance d'objets, opportunités émergentes |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progression du personnage, blessures, réputation |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Équipement, provenance des objets, croissance des reliques, chroniques |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Mémoire inter-sessions, effets relationnels |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Schéma NarrationPlan, contrats de rendu |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Planification des signaux audio, priorité, ducking |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registre de packs sonores + pack de base |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validation du contenu de monde |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Monde de départ Chapel Threshold |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Monde de départ Neon Lockbox |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Monde de départ Gaslight Detective |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Monde de départ Black Flag Requiem |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Monde de départ Ashfall Dead |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Monde de départ Dust Devil's Bargain |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Monde de départ Signal Loss |

## Budget de tokens

| Étape | Entrée | Sortie |
|-------|--------|--------|
| Interprétation de l'action | ~800 tokens | ~100 tokens |
| Narration de la scène (NarrationPlan) | ~1400 tokens | ~300 tokens |
| Dialogue PNJ | ~1400 tokens | ~100 tokens |
| **Total par tour** | **~3600 tokens** | **~500 tokens** |

Modèle par défaut : `claude-sonnet-4-20250514`. La génération de monde utilise Opus pour la qualité.

## Sécurité

Claude RPG est une application CLI locale qui effectue des appels API sortants vers Anthropic.

- **Données accédées :** fichiers de sauvegarde du joueur dans `~/.claude-rpg/saves/`, API Anthropic (HTTPS sortant uniquement)
- **Données NON accédées :** aucune télémétrie, aucune analyse, aucun accès au système de fichiers en dehors du répertoire de sauvegarde
- **Clé API :** lue depuis la variable d'environnement `ANTHROPIC_API_KEY` — jamais stockée, journalisée ou transmise au-delà de l'API Anthropic
- **Aucun secret dans le code source** — aucun token, identifiant ou clé API embarqué

Voir [SECURITY.md](SECURITY.md) pour la politique de sécurité complète et le signalement de vulnérabilités.

## Licence

MIT

---

Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
