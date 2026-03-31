<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/claude-rpg"><img src="https://img.shields.io/npm/v/claude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Claude RPG

Un jeu de rôle narratif basé sur une simulation, où Claude orchestre l'histoire, le moteur garantit la cohérence, et les mondes évoluent grâce aux rumeurs, aux pressions, aux factions, aux relations, à l'économie et aux systèmes d'évolution, menant à des conclusions significatives. Jouez-y ou développez-le.

## Qu'est-ce que Claude RPG ?

Claude RPG repose sur le [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — un environnement de simulation déterministe comprenant 29 modules couvrant les combats, la cognition, la perception, les factions, les rumeurs, la provenance des croyances, l'autonomie des PNJ, les compagnons, les leviers du joueur, les cartes stratégiques, la reconnaissance des objets, la provenance de l'équipement, les opportunités émergentes, la détection des arcs narratifs et les déclencheurs de fin de partie. Le rôle de Claude est d'interpréter, de narrer et de parler. Le rôle du moteur est de garantir la cohérence.

La règle d'or : **Claude propose, le moteur exécute.**

Les joueurs saisissent du texte librement. Claude interprète l'intention, le moteur résout les actions de manière déterministe, les filtres de perception déterminent ce que le joueur a réellement vu, et Claude ne narre que ce que le personnage a perçu — avec une voix, des effets sonores et une ambiance sonore orchestrés par l'environnement immersif.

Les PNJ ne récitent pas de scripts. Ils parlent en fonction de leurs croyances, de leurs souvenirs, de leur loyauté envers une faction et des rumeurs. Ils mentent pour des raisons. Ils sont incertains pour des raisons. Ils refusent pour des raisons. Le mode "directeur" vous permet d'examiner précisément les raisons.

## Créez Votre Propre Version

Claude RPG n'est pas seulement un jeu, mais une implémentation de référence pour l'écosystème de l'AI RPG Engine. Utilisez-le comme point de départ pour vos propres expériences narratives basées sur la simulation.

| Vous souhaitez... | Utiliser |
|------------|-----|
| **Play right now** | `npx claude-rpg play` (sélection interactive du monde et du personnage) |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — Studio d'édition 2D avec éditeur de cartes, constructeur de PNJ et validation. |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — Validation de schéma, tests de storyboard, pipelines d'exportation. |
| **Build a custom runtime** | Importer directement les packages [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — Remplacez Claude par n'importe quel LLM, ajoutez votre propre interface utilisateur. |
| **Add new game modules** | Forkez le moteur, ajoutez des modules à la chaîne de résolution et enregistrez-les. |

Le moteur est indépendant des LLM. Claude RPG utilise les modèles Anthropic, mais le moteur principal ne dépend pas des LLM — vous pouvez le connecter à n'importe quel modèle, voire l'utiliser de manière entièrement déterministe sans narration.

## Installation

```bash
npm install claude-rpg
```

Ou exécutez-le directement :

```bash
npx claude-rpg play
```

## Démarrage rapide

```bash
# Play — interactive world and character selection
npx claude-rpg play

# Accelerated campaign pacing
npx claude-rpg play --fast

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

Définissez votre clé API Anthropic (uniquement nécessaire pour la narration de Claude) :

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Nouveautés de la version 1.5.0

La version 1.5 est une version optimisée pour la robustesse, comprenant 67 corrections de bugs, 22 améliorations proactives et trois ensembles de fonctionnalités qui donnent vie au jeu.

| Fonctionnalité | Ce que cela signifie |
|---------|--------------|
| **API retry with backoff** | Les échecs temporaires de l'API Claude sont automatiquement retentés avec un délai exponentiel et une variation aléatoire. |
| **Periodic autosave** | Les sauvegardes de l'état du jeu sont effectuées à intervalles configurables. Fini les pertes de progression dues aux plantages ou aux déconnexions. |
| **Fast-path inventory** | Les verbes courants (utiliser, équiper, laisser tomber, examiner) sont résolus instantanément, sans nécessiter un aller-retour auprès du modèle de langage. |
| **Terminal colors + spinner** | Couleurs ANSI pour les dégâts, les soins et les noms des PNJ. Indicateur de chargement animé pendant les appels au modèle de langage. |
| **Tab completion** | Complétion automatique pour les commandes, les noms des PNJ, les objets et les lieux. |
| **NPC voice archetypes** | Différents styles de langage pour chaque type de PNJ : érudit, bourru, commerçant, noble, et plus encore. |
| **NPC conversation memory** | Les PNJ se souviennent de ce que vous avez dit et font référence aux échanges précédents dans les dialogues futurs. |
| **Token/cost tracking** | Utilisation des jetons par tour et cumulée, avec un coût estimé, affichée sur demande. |
| **Turn history compaction** | Les tours précédents sont résumés pour maintenir l'efficacité des fenêtres de contexte sans perdre le fil narratif. |
| **Système de quêtes + PNJ de l'environnement** | Les objectifs des quêtes sont suivis dans le contexte de la narration. Les PNJ de l'arrière-plan bavardent en fonction de l'ambiance du quartier. |
| **625 tests** | Passage de 209 à 625 tests répartis sur 53 fichiers de test. Corrections de bugs, confinement des erreurs, dégradation contrôlée et robustesse améliorée grâce à des tests internes. |

## Ce qui le rend différent

| Quoi | Comment |
|------|-----|
| **Séparation entre la vérité de la simulation et la narration** | Le moteur gère les combats, les mouvements, les dialogues — Claude ne fait que narrer le résultat. Pas de résultats imaginaires. |
| **Dialogue des PNJ basé sur la cognition** | Chaque ligne de dialogue des PNJ est construite à partir de leurs croyances, de leurs souvenirs, de leur moral, de leur suspicion, de leur faction et des rumeurs. |
| **Présentation tenant compte de la perception** | Claude ne reçoit que ce que le personnage du joueur a perçu. Les entités peu claires apparaissent comme des silhouettes, et non comme des cibles nommées. |
| **Environnement immersif audio/voix** | Des plans de narration structurés pilotent la synthèse vocale, les effets sonores, les ambiances et la musique via voice-soundboard. |
| **Visibilité du "directeur" sur la vérité cachée** | `/inspect pilgrim` affiche les croyances. `/trace` affiche la provenance. `/divergences` affiche ce que vous pensiez s'être passé par rapport à ce qui s'est réellement passé. |
| **Autonomie des PNJ avec chaînes de conséquences** | Les PNJ agissent en fonction de leurs objectifs, suivent leurs obligations et réagissent lorsque les seuils de loyauté changent. `/npc` et `/people` affichent les seuils, les leviers et les chaînes de conséquences actives. |
| **Living districts** | Les quartiers ont des aspects commerciaux, moraux et de sécurité qui évoluent en fonction des actions des joueurs, des mouvements des factions et des conséquences des PNJ. L'ambiance se reflète dans la narration et influence le déroulement du jeu. Les commandes `/districts` et `/district` permettent d'analyser l'état des lieux. |
| **Compagnons avec risque de départ** | Les membres du groupe ont un moral, une loyauté et des déclencheurs de départ. S'ils sont poussés trop loin, ils partent, et le moteur enregistre les raisons. |
| **Influence du joueur et actions politiques** | Utilisez votre influence, vos faveurs et vos informations pour mener des actions sociales, diffuser des rumeurs, négocier et saboter. La commande `/leverage` affiche votre capital politique. |
| **Origine de l'équipement et reliques** | Les objets ont une histoire. Une épée qui tue suffisamment d'ennemis devient une relique avec une légende. Les PNJ reconnaissent les objets équipés et réagissent en conséquence. La commande `/item` permet de connaître l'origine et l'histoire d'un objet. |
| **Emergent opportunities** | Les contrats, les primes, les faveurs, les missions de ravitaillement et les enquêtes apparaissent en fonction des conditions du monde : pression, pénurie, objectifs des PNJ, obligations. Acceptez, refusez, abandonnez ou trahissez. Les commandes `/jobs` et `/accepted` permettent de suivre les missions disponibles et celles en cours. |
| **Arcs narratifs et fins de partie** | Le moteur détecte 10 types d'arcs narratifs (ascension du pouvoir, traque, artisan de la royauté, résistance, etc.) et 8 classes de résolution de fin de partie (victoire, exil, renversement, martyre, etc.) en fonction de l'état général du jeu. La commande `/arcs` affiche la progression. La commande `/conclude` génère un épilogue structuré avec une narration optionnelle par un modèle de langage. |

## Architecture

```
Player types freeform text
    |
[1] ACTION INTERPRETATION (Claude)
    Input: player text + verbs + entities + exits
    Output: { verb, targetIds, confidence }
    |
[2] ENGINE RESOLUTION (deterministic)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] PERCEPTION FILTERING (deterministic)
    presentForObserver() -> what the player saw
    |
[4] HOOKS: pre-narration
    Zone ambient, combat alerts, death effects
    |
[5] NARRATION PLAN (Claude)
    Input: filtered scene + presentation state
    Output: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] AUDIO DIRECTOR
    Priority, ducking, cooldowns -> AudioCommand[]
    |
[7] PRESENTATION
    Voice synthesis + SFX + ambient via voice-soundboard
    Text rendering to terminal
    |
[8] NPC DIALOGUE (Claude, if speaking)
    Grounded in cognition: beliefs, memories, faction, rumors
    Voice-cast per NPC
```

## Environnement d'exécution immersif (v0.2)

Le narrateur ne produit pas de texte brut, mais un **Plan de Narration** : une recette structurée décrivant le texte, les effets sonores, les ambiances, les musiques et les paramètres vocaux.

| Module | Fonctionnalité |
|--------|---------|
| **Machine d'état de présentation** | Suit l'exploration, le dialogue, le combat et les conséquences, et détermine la sélection des pistes audio. |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — injecte des effets sonores adaptés au contexte. |
| **Voice Caster** | Attribue automatiquement les PNJ à des voix du [tableau de sons vocaux](https://github.com/mcp-tool-shop-org/original_voice-soundboard) en fonction de leur type, de leur genre et de leur faction. |
| **Audio Director** | Planifie les effets sonores avec priorité, atténuation, délais et anti-spam. |
| **Sound Registry** | Accès aux effets sonores par contenu, avec possibilité de recherche par tags, ambiance et intensité. |
| **MCP Bridge** | Traduit les commandes audio en appels aux fonctions du tableau de sons vocaux. |

## Trois modes

| Mode | Fonctionnement |
|------|-------------|
| **Play** | RPG narratif immersif. Claude narre, les PNJ parlent en fonction de leurs convictions, et les actions ont des conséquences grâce au moteur. |
| **Director** | Découvrez la vérité cachée : `/inspect <PNJ>`, `/faction <ID>`, `/trace <conviction>`, `/divergences`, `/npc <nom>`, `/people`, `/districts`, `/district <ID>`, `/item <nom>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Visualisez la chronologie des événements, opposant la vérité objective à la perception du joueur. |

## Écosystème

Claude RPG est un élément d'une chaîne d'outils plus vaste pour créer des jeux narratifs basés sur une simulation :

| Projet | Fonctionnement |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Environnement d'exécution de simulation déterministe — 29 modules, sans dépendances de modèles de langage. |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Studio de création de mondes 2D — éditeur de cartes, constructeur de PNJ, rendu, exportation. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validation de schéma, tests de storyboard, pipelines d'exportation de RPG basés sur l'IA. |
| **Claude RPG** (this repo) | Environnement d'exécution de référence — narration de Claude, audio immersif, outils de direction. |

## Paquets du moteur

Claude RPG dépend de ces paquets [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) :

| Paquet | Fonctionnalité |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | État, entités, actions, événements, règles, générateur de nombres aléatoires. |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 modules — combat, cognition, perception, factions, rumeurs, autonomie des PNJ, compagnons, influence, carte stratégique, reconnaissance d'objets, opportunités émergentes. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progression du personnage, blessures, réputation. |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Équipement, origine des objets, évolution des reliques, chroniques. |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Mémoire entre les sessions, effets des relations. |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Schéma de narration, contrats de rendu. |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Planification des signaux audio, priorité, atténuation. |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registre des packs audio + pack principal. |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validation du contenu du monde. |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Monde de départ "Chapel Threshold". |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Monde de départ "Neon Lockbox". |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Monde de départ "Gaslight Detective". |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Monde de départ "Black Flag Requiem". |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Monde de départ "Ashfall Dead". |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Monde de départ "Dust Devil's Bargain". |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Monde de départ "Signal Loss". |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Monde de départ "Iron Colosseum" |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Monde de départ "Jade Veil" |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Monde de départ "Crimson Court" |

## Garanties de fonctionnement (v1.5.0)

| Garantie | Mise en œuvre |
|-----------|------------|
| **Le moteur résout les problèmes avant la narration** | Harnais d'intégration de la boucle de tour avec 15 tests déterministes. |
| **Les fichiers de sauvegarde sont compatibles avec les nouvelles versions** | Processus de migration ordonné, tests historiques, écritures atomiques avec récupération via .bak. |
| **Les erreurs de Claude sont transformées en messages sûrs pour le joueur** | Adaptateur `NarrationError` typé avec 9 tests de gestion des erreurs, option `--debug` pour le diagnostic. |
| **Le streaming ne peut pas corrompre l'état** | L'état canonique est finalisé avant que le texte en streaming ne soit pris en compte ; 6 tests spécifiques au streaming. |
| **Couverture minimale des chemins critiques** | L'intégration continue applique des seuils par module pour la session, le narrateur, la boucle de tour et l'adaptateur du modèle de langage. |

## Budget de jetons

| Étape. | Entrée. | Sortie. |
|------|-------|--------|
| Interprétation de l'action. | ~800 jetons. | ~100 jetons. |
| Narration de la scène (NarrationPlan). | ~1400 jetons. | ~300 jetons. |
| Dialogue des PNJ. | ~1400 jetons. | ~100 jetons. |
| **Total per turn** | **~3600 jetons** | **~500 jetons** |

Modèle par défaut : `claude-sonnet-4-20250514`. La génération du monde utilise Opus pour la qualité.

## Sécurité

Claude RPG est une application CLI locale qui effectue des appels API sortants vers Anthropic.

- **Données consultées :** fichiers de sauvegarde du joueur dans `~/.claude-rpg/saves/`, API Anthropic (uniquement HTTPS sortant).
- **Données NON consultées :** aucune télémétrie, aucune analyse, aucun système de fichiers en dehors du répertoire de sauvegarde.
- **Clé API :** lue à partir de la variable d'environnement `ANTHROPIC_API_KEY` — jamais stockée, enregistrée ou transmise au-delà de l'API Anthropic.
- **Aucun secret dans le code source :** aucun jeton, identifiants ou clés API intégrés.

Consultez [SECURITY.md](SECURITY.md) pour la politique de sécurité complète et le signalement des vulnérabilités.

## Licence

MIT.

---

Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/).
