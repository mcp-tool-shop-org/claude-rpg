<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/claude-rpg/main/site/public/banner.jpg" width="800" alt="Ten glowing world-gates in a dark gallery — a lone traveler with a lantern chooses between them">
</p>

<p align="center"><em>Ten worlds. One narrator. The engine keeps the truth.</em></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/claude-rpg"><img src="https://img.shields.io/npm/v/%40mcptoolshop%2Fclaude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Claude RPG

Un jeu de rôle basé sur une simulation dans lequel Claude met en scène l’histoire, le moteur préserve la vérité et les mondes évoluent grâce aux rumeurs, à la pression, aux factions, aux relations, à l’économie et aux systèmes d’arcs narratifs, pour aboutir à des conclusions significatives. Jouez-y ou développez-le.


## Qu’est-ce que Claude RPG ?

Claude RPG s’appuie sur le [moteur de jeu de rôle IA](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — un moteur de simulation déterministe doté de 29 modules couvrant les combats, la cognition, la perception, les factions, les rumeurs, l’origine des croyances, l’autonomie des PNJ, les compagnons, l’influence du joueur, les cartes stratégiques, la reconnaissance des objets, l’origine de l’équipement, les opportunités émergentes, la détection des arcs narratifs et les déclencheurs de fin de partie. Le rôle de Claude est d’interpréter, de raconter et de parler. Le rôle du moteur est de garantir la vérité.

La règle d’or : **Claude propose, le moteur décide.**

Les joueurs saisissent du texte en toute liberté. Claude interprète l’intention, le moteur résout les actions de manière déterministe, les filtres de perception déterminent ce que le joueur a réellement vu, puis Claude ne raconte que ce que le personnage a perçu — avec une voix, des effets sonores et un son d’ambiance créés par l’environnement immersif.

Les PNJ ne récitent pas de scripts. Ils parlent en fonction de leurs croyances, de leurs souvenirs, de leur loyauté envers la faction et des rumeurs. Ils mentent pour une raison. Ils sont incertains pour une raison. Ils refusent pour une raison. Le mode réalisateur vous permet d’examiner exactement pourquoi.

## Créez votre propre version

Claude RPG n’est pas seulement un jeu, c’est aussi une implémentation de référence pour l’écosystème du moteur de jeu de rôle IA. Utilisez-le comme point de départ pour vos propres expériences narratives basées sur la simulation.

| Vous voulez… | Utiliser |
|------------|-----|
| **Play right now** | `npx @mcptoolshop/claude-rpg play` (sélection interactive du monde et du personnage) |
| **Create a new world** | `npx @mcptoolshop/claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — studio de création 2D avec éditeur de cartes, créateur de PNJ et validation |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — validation du schéma, tests de storyboard, pipelines d’exportation |
| **Build a custom runtime** | Importez directement les packages [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — remplacez Claude par n’importe quel LLM, ajoutez votre propre interface utilisateur |
| **Add new game modules** | Dérivez le moteur, ajoutez des modules au pipeline de résolution et enregistrez-les |

Le moteur est indépendant du LLM. Claude RPG utilise les modèles Anthropic, mais le moteur principal ne dépend pas du tout d’un LLM — vous pouvez le connecter à n’importe quel modèle ou même l’exécuter en mode entièrement déterministe sans narration.

## Installer

```bash
npm install @mcptoolshop/claude-rpg
```

Ou exécutez-le directement :

```bash
npx @mcptoolshop/claude-rpg play
```

## Démarrage rapide

```bash
# Play — interactive world and character selection (ten worlds, grouped by difficulty)
npx @mcptoolshop/claude-rpg play

# Jump straight into a named world
npx @mcptoolshop/claude-rpg play --world gladiator

# Accelerated campaign pacing
npx @mcptoolshop/claude-rpg play --fast

# Generate a new world from a prompt
npx @mcptoolshop/claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

Définissez votre clé API Anthropic (uniquement nécessaire pour la narration de Claude) :

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Quoi de neuf dans la version 1.6.0 ?

La version 1.6 rend les dix mondes réels, donne un poids réel à la défaite et rend le narrateur résilient lorsque le réseau ne fonctionne pas.

| Fonctionnalité | Ce que cela signifie |
|---------|--------------|
| **Ten playable worlds** | L’Arène de fer (gladiateur), le Voile de jade (ronin) et la Cour cramoisie (vampire) rejoignent la liste — dix mondes, regroupés par difficulté dans le sélecteur. |
| **Indicateur `--world`** | `npx @mcptoolshop/claude-rpg play --world gladiator` permet de passer directement au menu et d’accéder à un monde spécifique. Dix alias, tous répertoriés dans `--help`. |
| **Death is a setback** | Tomber au combat fait apparaître un écran de mort distinct et limite vos actions jusqu’à ce que vous vous releviez — les campagnes se terminent délibérément grâce à `/conclude`, jamais à cause d’un seul mauvais combat. |
| **Streaming narration** | Le texte est rendu au moment où le narrateur l’écrit, et non après. |
| **Utilisation de `/cost` à la demande** | Utilisation du jeton de session et dépenses estimées, sans avoir à dépenser quoi que ce soit pour demander. |
| **Un indicateur qui dit la vérité** | Pendant les nouvelles tentatives d’API, l’indicateur en rotation indique la tentative et la cause — « toujours en train de réfléchir (tentative 1/2 — limite de débit atteinte) ». En cas de panne prolongée, le texte de secours honnête affiche : « cela se produit toujours ». |
| **Ambient world chatter** | Les PNJ qui ne sont pas des personnages principaux vaquent à leurs occupations — un marchand vérifie les prix, un garde scrute la foule — avec une touche propre à chaque monde, sans aucun coût d’API. |
| **Les PNJ se souviennent, même entre les sauvegardes** | La mémoire des conversations persiste désormais lors de la sauvegarde et du chargement : ce que vous avez dit au garde il y a deux sessions influence toujours ce qu’il dit. |
| **Names, not slugs** | La barre d’état, les résumés et les listes de sauvegarde affichent « Chevalier pénitent », jamais `penitent-knight`. Les signaux sonores sont lus comme des mots, jamais `white_noise`. |
| **1 542 tests** | Passé de 625 dans 95 fichiers, avec des seuils de couverture par chemin appliqués dans l’intégration continue. |

## Pourquoi c’est différent

| Quoi | Comment |
|------|-----|
| **La vérité de la simulation est distincte de la narration** | Le moteur résout les combats, les mouvements et les dialogues — Claude ne fait que raconter le résultat. Pas d’événements hallucinés. |
| **Les dialogues des PNJ sont fondés sur la cognition** | Chaque réplique des PNJ est construite à partir de leurs croyances, de leurs souvenirs, de leur moral, de leur suspicion, de leur faction et des rumeurs. |
| **Présentation tenant compte de la perception** | Claude ne reçoit que ce que le personnage joueur a perçu. Les entités à faible clarté apparaissent comme des silhouettes sombres, et non comme des cibles nommées. |
| **Environnement immersif audio/voix** | Les plans de narration structurés pilotent la synthèse vocale, les effets sonores, les couches d’ambiance et la musique via voice-soundboard. |
| **Visibilité du réalisateur sur la vérité cachée** | `/inspect pilgrim` affiche les croyances. `/trace` affiche l’origine. `/divergences` affiche ce que vous pensiez qu’il s’était passé par rapport à ce qui s’est réellement passé. |
| **Autonomie des PNJ avec chaînes de conséquences** | Les PNJ agissent en fonction de leurs objectifs, suivent leurs obligations et se vengent lorsque les seuils de loyauté sont dépassés. `/npc` et `/people` mettent en évidence les seuils, les angles d’influence et les chaînes de conséquences actives. |
| **Living districts** | Les districts ont une économie, un moral et une sécurité qui évoluent en fonction des actions du joueur, des mouvements des factions et des conséquences des PNJ. L’humeur influence la narration et ajuste le déroulement du jeu. `/districts` et `/district` analysent l’ambiance du quartier. |
| **Compagnons avec risque de départ** | Les membres du groupe ont un moral, une loyauté et des facteurs déclencheurs de départ. Si vous les poussez trop loin, ils partent — pour des raisons que le moteur enregistre. |
| **Influence du joueur et actions politiques** | Dépensez votre influence, vos faveurs et vos renseignements dans des actions sociales, de rumeur, diplomatiques ou de sabotage. `/leverage` affiche votre capital politique. |
| **Provenance de l’équipement et reliques** | Les objets ont une histoire. Une épée qui a tué suffisamment d’ennemis devient une relique avec un surnom. Les PNJ reconnaissent les objets équipés et réagissent. `/item` examine la provenance et retrace l’histoire. |
| **Emergent opportunities** | Les contrats, les primes, les faveurs, les missions de ravitaillement et les enquêtes découlent des conditions du monde : pression, pénurie, objectifs des PNJ, obligations. Acceptez, refusez, abandonnez ou trahissez. `/jobs` et `/accepted` suivent les tâches disponibles et en cours. |
| **Arcs narratifs de la campagne et fins de partie** | Le moteur détecte 10 types d’arcs narratifs (ascension au pouvoir, traque, créateur de roi, résistance, etc.) et 8 classes de résolution de fin de partie (victoire, exil, renversement, martyre, etc.) à partir de l’état accumulé. `/arcs` affiche la trajectoire. `/conclude` génère un épilogue structuré avec une narration LLM facultative. |

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

## Environnement d’exécution immersif (v0.2)

Le narrateur ne produit pas de prose brute, mais un **plan de narration** : une recette structurée décrivant le texte, les effets sonores, les couches ambiantes, les signaux musicaux et les paramètres vocaux.

| Module | Objectif |
|--------|---------|
| **Machine d’état de présentation** | Suit l’exploration / le dialogue / le combat / les conséquences — détermine la sélection de la couche audio. |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — injectent un son adapté au contexte. |
| **Voice Caster** | Attribue automatiquement les PNJ aux voix du [tableau de sons](https://github.com/mcp-tool-shop-org/original_voice-soundboard) en fonction du type, du sexe et de la faction. |
| **Audio Director** | Planifie les signaux avec priorité, atténuation et délai d’attente pour éviter le spam. |
| **Sound Registry** | Entrées audio adressables par contenu — recherche par balises, humeur, intensité. |
| **MCP Bridge** | Traduit les commandes audio en appels d’outils du tableau de sons. |

## Trois modes

| Mode | Ce qu’il fait |
|------|-------------|
| **Play** | RPG narratif immersif. Claude raconte l’histoire, les PNJ parlent en fonction de leurs convictions, et les actions se résolvent grâce au moteur. |
| **Director** | Examinez la vérité cachée : `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Parcourez la chronologie des événements en affichant côte à côte la vérité objective et la perception du joueur. |

## Écosystème

Claude RPG n’est qu’une pièce d’un ensemble plus vaste d’outils pour créer des jeux narratifs basés sur une simulation :

| Projet | Ce qu’il fait |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Environnement d’exécution de simulation déterministe — 29 modules, aucune dépendance LLM. |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Studio d’édition de monde en 2D — éditeur de cartes, créateur de PNJ, moteur de rendu, exportation. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validation du schéma, tests de storyboard, pipelines d’exportation RPG IA. |
| **Claude RPG** (this repo) | Environnement d’exécution de référence — narration Claude, son immersif, outils de direction. |

## Packages du moteur

Claude RPG dépend des packages suivants [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) :

| Package | Objectif |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | État, entités, actions, événements, règles, RNG. |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 modules — combat, cognition, perception, factions, rumeurs, autonomie des PNJ, compagnons, influence, carte stratégique, reconnaissance des objets, opportunités émergentes. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progression du personnage, blessures, réputation. |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Équipement, provenance des objets, évolution des reliques, chroniques. |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Mémoire intersessions, effets relationnels. |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Schéma NarrationPlan, contrats de rendu. |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Planification des signaux audio, priorité, atténuation. |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registre des packs sonores + pack principal. |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validation du contenu du monde. |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold, monde de départ. |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox, monde de départ. |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective, monde de départ. |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem, monde de départ. |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead, monde de départ. |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil’s Bargain, monde de départ. |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss, monde de départ. |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Iron Colosseum, monde de départ. |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Jade Veil, monde de départ. |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Crimson Court, monde de départ. |

## Garanties d’exécution (v1.6.0)

| Garantie | Application |
|-----------|------------|
| **Le moteur résout avant la narration.** | Intégration de boucle avec 15 tests déterministes. |
| **Les fichiers d’enregistrement survivent aux mises à jour.** | Pipeline de migration ordonné, tests de fixtures historiques, écritures atomiques avec récupération .bak. |
| **Les erreurs de Claude se traduisent par des messages sécurisés pour le joueur.** | Adaptateur `NarrationError` typé avec 9 tests de chemin d’erreur, indicateur `--debug` pour les diagnostics. |
| **Le streaming ne peut pas corrompre l’état.** | L’état canonique est finalisé avant que le texte diffusé n’ait d’importance ; 6 tests spécifiques au streaming. |
| **Couverture minimale sur les chemins critiques.** | CI applique des seuils par module sur la session, le narrateur, la boucle et l’adaptateur LLM. |

## Budget de jetons

| Étape | Entrée | Sortie |
|------|-------|--------|
| Interprétation de l’action | ~800 jetons | ~100 jetons |
| Narration de scène (plan de narration) | ~1400 jetons | ~300 jetons |
| Dialogue des PNJ | ~1400 jetons | ~100 jetons |
| **Total per turn** | **~3600 jetons** | **~500 jetons** |

Modèle par défaut : `claude-sonnet-4-20250514`. La génération du monde utilise Opus pour la qualité.

## Sécurité

Claude RPG est une application CLI locale qui effectue des appels d’API vers Anthropic.

- **Données concernées :** fichiers de sauvegarde du joueur dans `~/.claude-rpg/saves/`, API Anthropic (appels HTTPS sortants uniquement)
- **Données non concernées :** aucune télémétrie, aucun suivi analytique, aucun accès au système de fichiers en dehors du répertoire de sauvegarde
- **Clé d’API :** lue à partir de la variable d’environnement `ANTHROPIC_API_KEY` — jamais stockée, enregistrée ou transmise en dehors de l’API Anthropic
- **Aucun secret dans le code source** — aucun jeton, aucune information d’identification ni clé d’API intégrée

Consultez [SECURITY.md](SECURITY.md) pour consulter la politique de sécurité complète et les informations sur la déclaration des vulnérabilités.

## Licence

MIT

---

Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
