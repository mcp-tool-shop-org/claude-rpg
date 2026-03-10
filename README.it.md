<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Un gioco di ruolo (GdR) basato sulla simulazione, in cui Claude gestisce la narrazione, il motore garantisce la veridicità e i mondi evolvono attraverso voci, pressioni, fazioni, relazioni, economia e sistemi di progressione, portando a conclusioni significative. Gioca o sviluppa ulteriormente.

## Cos'è Claude RPG?

Claude RPG si basa sul [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — un ambiente di simulazione deterministico con 29 moduli che coprono combattimento, cognizione, percezione, fazioni, voci, origine delle credenze, autonomia dei personaggi non giocanti (PNG), compagni, influenza del giocatore, mappe strategiche, riconoscimento degli oggetti, origine delle attrezzature, opportunità emergenti, rilevamento degli archi narrativi e trigger di fine gioco. Il compito di Claude è interpretare, narrare e parlare. Il compito del motore è mantenere la veridicità.

La regola d'oro: **Claude propone, il motore decide.**

I giocatori inseriscono testo libero. Claude interpreta l'intento, il motore risolve le azioni in modo deterministico, i filtri di percezione decidono cosa il giocatore vede effettivamente e, quindi, Claude narra solo ciò che il personaggio percepisce, con voce, effetti sonori e audio ambientale gestiti dall'ambiente di immersione.

I PNG non recitano copioni. Parlano in base alle loro credenze, ai loro ricordi, alla loro lealtà verso una fazione e alle voci. Mentono per motivi. Sono incerti per motivi. Rifiutano per motivi. La modalità regista consente di esaminare esattamente il perché.

## Crea il tuo

Claude RPG non è solo un gioco, ma un'implementazione di riferimento per l'ecosistema dell'AI RPG Engine. Utilizzalo come punto di partenza per le tue esperienze narrative basate sulla simulazione.

| Vuoi... | Usare |
|------------|-----|
| **Play right now** | `npx claude-rpg play --world fantasy` |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — studio di authoring 2D con editor di mappe, costruttore di PNG e sistema di validazione. |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — validazione dello schema, test degli storyboard, pipeline di esportazione. |
| **Build a custom runtime** | Importare direttamente i pacchetti di [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — sostituire Claude con qualsiasi altro modello linguistico (LLM), aggiungere la tua interfaccia utente. |
| **Add new game modules** | Creare una copia (fork) del motore, aggiungere moduli alla pipeline di risoluzione e registrarli. |

Il motore è indipendente dai modelli linguistici (LLM). Claude RPG utilizza i modelli di Anthropic, ma il motore principale non ha alcuna dipendenza da LLM: puoi collegarlo a qualsiasi modello o addirittura eseguirlo in modo completamente deterministico senza narrazione.

## Installare

```bash
npm install claude-rpg
```

Oppure eseguirlo direttamente:

```bash
npx claude-rpg play --world fantasy
```

## Guida rapida

```bash
# Play the built-in Chapel Threshold scenario
npx claude-rpg play --world fantasy

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

Impostare la tua chiave API di Anthropic (necessaria solo per la narrazione di Claude):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Perché è diverso

| Cosa | Come |
|------|-----|
| **Veridicità della simulazione separata dalla narrazione** | Il motore gestisce combattimenti, movimenti, dialoghi: Claude narra solo il risultato. Nessun risultato immaginario. |
| **Dialoghi dei PNG basati sulla cognizione** | Ogni riga del dialogo dei PNG è costruita in base alle loro credenze, ai loro ricordi, al loro morale, al loro sospetto, alla loro fazione e alle voci. |
| **Presentazione consapevole della percezione** | Claude riceve solo ciò che il personaggio del giocatore percepisce. Le entità poco chiare appaiono come figure sfocate, non come bersagli nominati. |
| **Ambiente di immersione audio/voce** | Piani di narrazione strutturati guidano la sintesi vocale, gli effetti sonori, gli strati ambientali e la musica tramite voice-soundboard. |
| **Visibilità della modalità regista sulla verità nascosta** | `/inspect pilgrim` mostra le credenze. `/trace` mostra l'origine. `/divergences` mostra cosa pensavi fosse successo rispetto a ciò che è realmente accaduto. |
| **Autonomia dei PNG con catene di conseguenze** | I PNG agiscono in base agli obiettivi, tracciano gli obblighi e reagiscono quando i punti di rottura della lealtà cambiano. `/npc` e `/people` mostrano i punti di rottura, gli angoli di influenza e le catene di conseguenze attive. |
| **Living districts** | I distretti presentano commercio, morale e sicurezza che cambiano in base alle azioni del giocatore, alle mosse delle fazioni e alle conseguenze delle azioni dei personaggi non giocanti (PNG). L'umore influenza la narrazione e determina il livello di difficoltà del gioco. I comandi `/distretti` e `/district` permettono di analizzare la situazione del quartiere. |
| **Compagni con rischio di abbandono** | I membri del gruppo hanno morale, lealtà e possibili cause di abbandono. Se li si spinge troppo oltre, potrebbero andarsene, per motivi che il sistema tiene traccia. |
| **Influenza del giocatore e azioni politiche** | Utilizza influenza, favori e informazioni per azioni sociali, diffusione di voci, diplomazia e sabotaggio. Il comando `/leverage` mostra il tuo capitale politico. |
| **Provenienza delle attrezzature e reliquie** | Gli oggetti hanno una storia. Una spada che uccide abbastanza persone può diventare una reliquia con un'epigrafe. I PNG riconoscono gli oggetti equipaggiati e reagiscono di conseguenza. Il comando `/item` permette di analizzare la provenienza e la storia degli oggetti. |
| **Emergent opportunities** | Contratti, taglie, favori, missioni di rifornimento e indagini nascono dalle condizioni del mondo: pressione, scarsità, obiettivi dei PNG, obblighi. Accetta, rifiuta, abbandona o tradisci. I comandi `/jobs` e `/accepted` tengono traccia dei lavori disponibili e di quelli attivi. |
| **Archi narrativi e finali** | Il sistema rileva 10 tipi di archi narrativi (ascesa al potere, perseguitato, artefice, resistenza, ecc.) e 8 classi di risoluzione finale (vittoria, esilio, rovesciamento, martirio, ecc.) a partire dallo stato accumulato. Il comando `/arcs` mostra la traiettoria. Il comando `/conclude` genera un epilogo strutturato con una narrazione opzionale generata da un modello linguistico (LLM). |

## Architettura

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

## Runtime di immersione (v0.2)

Il narratore non produce prosa grezza, ma genera un **Piano di Narrazione**: una ricetta strutturata che descrive il testo, gli effetti sonori, gli elementi ambientali, le musiche e i parametri vocali.

| Modulo | Scopo |
|--------|---------|
| **Macchina a Stati di Presentazione** | Traccia l'esplorazione, il dialogo, il combattimento e le conseguenze, e determina la selezione degli elementi audio. |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking`: inserisce audio contestualmente rilevante. |
| **Voice Caster** | Assegna automaticamente i PNG a voci tramite [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) in base al tipo, al genere e alla fazione. |
| **Audio Director** | Pianifica gli effetti sonori con priorità, attenuazione, tempi di ricarica e anti-spam. |
| **Sound Registry** | Elementi audio indirizzabili tramite contenuto: ricerca per tag, umore e intensità. |
| **MCP Bridge** | Traduce i comandi audio in chiamate allo strumento voice-soundboard. |

## Tre modalità

| Modalità | Cosa fa |
|------|-------------|
| **Play** | Gioco di ruolo narrativo immersivo. Claude narra, i PNG parlano in base alle loro convinzioni, le azioni si risolvono tramite il sistema. |
| **Director** | Scopri la verità nascosta: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Visualizza la linea temporale degli eventi, mostrando la verità oggettiva a fianco della percezione del giocatore. |

## Ecosistema

Claude RPG è un componente di una suite di strumenti più ampia per la creazione di giochi narrativi basati sulla simulazione:

| Progetto | Cosa fa |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Runtime di simulazione deterministica: 29 moduli, zero dipendenze da modelli linguistici (LLM). |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Studio di creazione di mondi 2D: editor di mappe, costruttore di PNG, renderer, esportazione. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validazione dello schema, test delle storie, pipeline di esportazione per giochi di ruolo con intelligenza artificiale. |
| **Claude RPG** (this repo) | Runtime di riferimento: narrazione di Claude, audio immersivo, strumenti per il regista. |

## Pacchetti del motore

Claude RPG dipende da questi pacchetti [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Stato, entità, azioni, eventi, regole, generazione di numeri casuali (RNG). |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 moduli: combattimento, cognizione, percezione, fazioni, voci, autonomia dei PNG, compagni, influenza, mappa strategica, riconoscimento degli oggetti, opportunità emergenti. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progressione del personaggio, ferite, reputazione |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipaggiamento, provenienza degli oggetti, sviluppo degli artefatti, cronache |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memoria tra sessioni, effetti sulle relazioni |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Schema di NarrationPlan, contratti di rendering |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Pianificazione dei segnali audio, priorità, attenuazione |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro dei pacchetti audio + pacchetto principale |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validazione dei contenuti del mondo |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Mondo iniziale "Chapel Threshold" |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Mondo iniziale "Neon Lockbox" |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Mondo iniziale "Gaslight Detective" |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Mondo iniziale "Black Flag Requiem" |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Mondo iniziale "Ashfall Dead" |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Mondo iniziale "Dust Devil's Bargain" |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Mondo iniziale "Signal Loss" |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Mondo iniziale "Iron Colosseum" |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Mondo iniziale "Jade Veil" |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Mondo iniziale "Crimson Court" |

## Budget dei token

| Passo | Input | Output |
|------|-------|--------|
| Interpretazione delle azioni | ~800 token | ~100 token |
| Narrazione della scena (NarrationPlan) | ~1400 token | ~300 token |
| Dialoghi dei PNG | ~1400 token | ~100 token |
| **Total per turn** | **~3600 token** | **~500 token** |

Modello predefinito: `claude-sonnet-4-20250514`. La generazione del mondo utilizza Opus per la qualità.

## Sicurezza

Claude RPG è un'applicazione CLI locale che effettua chiamate API in uscita verso Anthropic.

- **Dati accessibili:** file di salvataggio del giocatore in `~/.claude-rpg/saves/`, API di Anthropic (solo HTTPS in uscita)
- **Dati NON accessibili:** nessuna telemetria, nessuna analisi, nessun file system al di fuori della directory di salvataggio
- **Chiave API:** letta dalla variabile d'ambiente `ANTHROPIC_API_KEY` — non memorizzata, registrata o trasmessa al di fuori dell'API di Anthropic
- **Nessun segreto nel codice sorgente** — nessun token, credenziali o chiave API incorporati

Consultare [SECURITY.md](SECURITY.md) per la politica di sicurezza completa e la segnalazione di vulnerabilità.

## Licenza

MIT

---

Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
