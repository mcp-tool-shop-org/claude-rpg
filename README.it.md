<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/claude-rpg"><img src="https://img.shields.io/npm/v/claude-rpg.svg" alt="versione npm"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="Licenza: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Pagina di presentazione"></a>
</p>

# Claude RPG

Un RPG da terminale basato sulla simulazione, dove Claude narra, il motore preserva la verità e il runtime di immersione gestisce voce, suoni e presentazione.

## Cos'è Claude RPG?

Claude RPG si appoggia sull'[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — un runtime di simulazione deterministico con 29 moduli che coprono combattimento, cognizione, percezione, fazioni, voci, provenienza delle credenze, agency degli NPC, compagni, leva del giocatore, mappe strategiche, riconoscimento oggetti, provenienza dell'equipaggiamento, opportunità emergenti, rilevamento degli archi narrativi e trigger di fine partita. Il compito di Claude è interpretare, narrare e dare voce. Il compito del motore è possedere la verità.

La regola d'oro: **Claude propone, il motore decide.**

I giocatori digitano testo libero. Claude interpreta l'intento, il motore risolve le azioni in modo deterministico, i filtri di percezione decidono cosa il giocatore ha effettivamente visto, e poi Claude narra solo ciò che il personaggio ha percepito — con voce, effetti sonori e audio ambientale gestiti dal runtime di immersione.

Gli NPC non recitano copioni. Parlano in base a credenze, ricordi, lealtà di fazione e voci. Mentono per un motivo. Sono incerti per un motivo. Rifiutano per un motivo. La modalità Regista ti permette di esaminare esattamente il perché.

## Installazione

```bash
npm install claude-rpg
```

Oppure esegui direttamente:

```bash
npx claude-rpg play --world fantasy
```

## Avvio rapido

```bash
# Gioca lo scenario integrato Chapel Threshold
npx claude-rpg play --world fantasy

# Genera un nuovo mondo da un prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

Imposta la tua chiave API di Anthropic:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Perché è diverso

| Cosa | Come |
|------|------|
| **Verità della simulazione separata dalla narrazione** | Il motore risolve combattimento, movimento, dialogo — Claude narra solo il risultato. Nessun esito allucinato. |
| **Dialoghi NPC fondati sulla cognizione** | Ogni battuta degli NPC è costruita a partire da credenze, ricordi, morale, sospetto, fazione e voci. |
| **Presentazione consapevole della percezione** | Claude riceve solo ciò che il personaggio del giocatore ha percepito. Le entità a bassa chiarezza appaiono come figure oscure, non come bersagli con nome. |
| **Runtime di immersione audio/vocale** | Piani di narrazione strutturati guidano la sintesi vocale, gli effetti sonori, i livelli ambientali e la musica tramite voice-soundboard. |
| **Visibilità del Regista sulla verità nascosta** | `/inspect pilgrim` mostra le credenze. `/trace` mostra la provenienza. `/divergences` mostra cosa pensavi fosse successo rispetto a ciò che è realmente accaduto. |
| **Agency degli NPC con catene di conseguenze** | Gli NPC agiscono in base a obiettivi, tracciano obblighi e reagiscono quando i punti di rottura della lealtà cambiano. `/npc` e `/people` mostrano punti di rottura, angoli di leva e catene di conseguenze attive. |
| **Distretti viventi** | I distretti hanno commercio, morale e sicurezza che cambiano in base alle azioni del giocatore, alle mosse delle fazioni e alle catene di conseguenze degli NPC. L'umore fluisce nella narrazione e modula il gameplay. `/districts` e `/district` permettono di esaminare il polso del quartiere. |
| **Compagni con rischio di abbandono** | I membri del gruppo hanno morale, lealtà e trigger di abbandono. Spingili troppo oltre e se ne andranno — per motivi che il motore traccia. |
| **Leva del giocatore e azione politica** | Spendi influenza, favori e informazioni in azioni sociali, di propaganda, diplomazia e sabotaggio. `/leverage` mostra il tuo capitale politico. |
| **Provenienza dell'equipaggiamento e reliquie** | Gli oggetti portano con sé una storia. Una spada che uccide abbastanza diventa una reliquia con un epiteto. Gli NPC riconoscono gli oggetti equipaggiati e reagiscono. `/item` ispeziona provenienza e cronache. |
| **Opportunità emergenti** | Contratti, taglie, favori, missioni di rifornimento e indagini nascono dalle condizioni del mondo — pressione, scarsità, obiettivi degli NPC, obblighi. Accetta, rifiuta, abbandona o tradisci. `/jobs` e `/accepted` tracciano i lavori disponibili e quelli attivi. |
| **Archi narrativi e finali** | Il motore rileva 10 tipi di arco narrativo (ascesa al potere, braccato, kingmaker, resistenza, ecc.) e 8 classi di risoluzione finale (vittoria, esilio, rovesciamento, martirio, ecc.) dallo stato accumulato. `/arcs` mostra la traiettoria. `/conclude` genera un epilogo strutturato con narrazione LLM opzionale. |

## Architettura

```
Il giocatore digita testo libero
    |
[1] INTERPRETAZIONE DELL'AZIONE (Claude)
    Input: testo del giocatore + verbi + entità + uscite
    Output: { verb, targetIds, confidence }
    |
[2] RISOLUZIONE DEL MOTORE (deterministica)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] FILTRAGGIO DELLA PERCEZIONE (deterministico)
    presentForObserver() -> ciò che il giocatore ha visto
    |
[4] HOOK: pre-narrazione
    Ambiente di zona, allarmi di combattimento, effetti di morte
    |
[5] PIANO DI NARRAZIONE (Claude)
    Input: scena filtrata + stato di presentazione
    Output: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] DIRETTORE AUDIO
    Priorità, ducking, cooldown -> AudioCommand[]
    |
[7] PRESENTAZIONE
    Sintesi vocale + SFX + ambiente tramite voice-soundboard
    Rendering del testo nel terminale
    |
[8] DIALOGO NPC (Claude, se parlano)
    Fondato sulla cognizione: credenze, ricordi, fazione, voci
    Voice-cast per NPC
```

## Runtime di immersione (v0.2)

Il narratore non produce prosa grezza — produce un **NarrationPlan**: una ricetta strutturata che descrive testo, effetti sonori, livelli ambientali, segnali musicali e parametri vocali.

| Modulo | Scopo |
|--------|-------|
| **Macchina a stati di presentazione** | Traccia esplorazione / dialogo / combattimento / aftermath — guida la selezione del livello audio |
| **Ciclo di vita degli hook** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — iniettano audio contestuale |
| **Voice Caster** | Mappa automaticamente gli NPC alle voci di [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) per tipo, genere, fazione |
| **Direttore audio** | Pianifica i segnali con priorità, ducking, cooldown, anti-spam |
| **Registro sonoro** | Voci audio indirizzabili per contenuto — interrogabili per tag, umore, intensità |
| **Bridge MCP** | Traduce AudioCommand in chiamate agli strumenti di voice-soundboard |

## Tre modalità

| Modalità | Cosa fa |
|----------|---------|
| **Play** | RPG narrato e immersivo. Claude narra, gli NPC parlano in base alle credenze, le azioni si risolvono attraverso il motore. |
| **Director** | Ispeziona la verità nascosta: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Percorri la timeline degli eventi mostrando affiancate la verità oggettiva e la percezione del giocatore. |

## Pacchetti del motore

Claude RPG dipende da questi pacchetti di [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Pacchetto | Scopo |
|-----------|-------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Stato, entità, azioni, eventi, regole, RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 moduli — combattimento, cognizione, percezione, fazioni, voci, agency NPC, compagni, leva, mappa strategica, riconoscimento oggetti, opportunità emergenti |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progressione del personaggio, ferite, reputazione |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipaggiamento, provenienza oggetti, crescita delle reliquie, cronache |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memoria cross-sessione, effetti relazionali |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Schema NarrationPlan, contratti di rendering |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Pianificazione segnali audio, priorità, ducking |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro dei pacchetti sonori + pacchetto base |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validazione dei contenuti del mondo |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Mondo iniziale Chapel Threshold |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Mondo iniziale Neon Lockbox |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Mondo iniziale Gaslight Detective |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Mondo iniziale Black Flag Requiem |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Mondo iniziale Ashfall Dead |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Mondo iniziale Dust Devil's Bargain |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Mondo iniziale Signal Loss |

## Budget di token

| Passaggio | Input | Output |
|-----------|-------|--------|
| Interpretazione dell'azione | ~800 token | ~100 token |
| Narrazione della scena (NarrationPlan) | ~1400 token | ~300 token |
| Dialogo NPC | ~1400 token | ~100 token |
| **Totale per turno** | **~3600 token** | **~500 token** |

Modello predefinito: `claude-sonnet-4-20250514`. La generazione dei mondi usa Opus per la qualità.

## Sicurezza

Claude RPG è un'applicazione CLI locale che effettua chiamate API in uscita verso Anthropic.

- **Dati utilizzati:** file di salvataggio del giocatore in `~/.claude-rpg/saves/`, API di Anthropic (solo HTTPS in uscita)
- **Dati NON utilizzati:** nessuna telemetria, nessuna analisi, nessun accesso al filesystem al di fuori della directory di salvataggio
- **Chiave API:** letta dalla variabile d'ambiente `ANTHROPIC_API_KEY` — mai memorizzata, registrata o trasmessa al di fuori dell'API di Anthropic
- **Nessun segreto nel codice sorgente** — nessun token, credenziale o chiave API incorporati

Consulta [SECURITY.md](SECURITY.md) per la politica di sicurezza completa e la segnalazione delle vulnerabilità.

## Licenza

MIT

---

Realizzato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
