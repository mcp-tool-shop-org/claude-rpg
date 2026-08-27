<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/claude-rpg"><img src="https://img.shields.io/npm/v/%40mcptoolshop%2Fclaude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Claude RPG

Un gioco di ruolo basato su simulazioni in cui Claude orchestra la storia, il motore preserva la verità e i mondi si evolvono attraverso voci, pressioni, fazioni, relazioni, economia e sistemi narrativi, portando a conclusioni significative. Giocalo o sviluppalo ulteriormente.

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/claude-rpg/main/site/public/banner.jpg" width="800" alt="Ten glowing world-gates in a dark gallery — a lone traveler with a lantern chooses between them">
</p>

<p align="center"><em>Ten worlds. One narrator. The engine keeps the truth.</em></p>

## Cos'è Claude RPG?

Claude RPG si basa su [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), un motore di simulazione deterministico con 29 moduli che coprono combattimento, cognizione, percezione, fazioni, voci, origine delle credenze, autonomia dei PNG, compagni, influenza del giocatore, mappe strategiche, riconoscimento degli oggetti, origine dell'equipaggiamento, opportunità emergenti, rilevamento degli archi narrativi della campagna e fattori scatenanti per il finale. Il compito di Claude è interpretare, narrare e parlare. Il compito del motore è quello di garantire la verità.

La regola d'oro: **Claude propone, il motore decide.**

I giocatori digitano testo in forma libera. Claude interpreta le intenzioni, il motore risolve le azioni in modo deterministico, i filtri di percezione decidono cosa ha effettivamente visto il giocatore e quindi Claude narra solo ciò che il personaggio ha percepito, con voce, effetti sonori e audio ambientale gestiti dal motore di immersione.

I PNG non recitano script. Parlano in base alle loro credenze, ricordi, lealtà alla fazione e voci. Mentono per motivi specifici. Sono incerti per motivi specifici. Si rifiutano per motivi specifici. La modalità Direttore ti consente di esaminare esattamente perché.

## Crea il tuo gioco

Claude RPG non è solo un gioco, ma anche un'implementazione di riferimento per l'ecosistema AI RPG Engine. Usalo come punto di partenza per le tue esperienze narrative basate su simulazioni.

| Vuoi... | Usare |
|------------|-----|
| **Play right now** | `npx @mcptoolshop/claude-rpg play` (selezione interattiva del mondo e del personaggio) |
| **Create a new world** | `npx @mcptoolshop/claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge), uno studio di creazione 2D con editor di mappe, creatore di PNG e strumento di validazione. |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive), uno strumento per la validazione dello schema, il test degli storyboard e le pipeline di esportazione. |
| **Build a custom runtime** | Importa direttamente i pacchetti [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine): sostituisci Claude con qualsiasi LLM, aggiungi la tua interfaccia utente. |
| **Add new game modules** | Fork del motore, aggiunta di moduli alla pipeline di risoluzione e registrazione. |

Il motore è indipendente dal modello linguistico (LLM). Claude RPG utilizza i modelli Anthropic, ma il motore principale non ha dipendenze da LLM: puoi collegarlo a qualsiasi modello o eseguirlo in modo completamente deterministico senza narrazione.

## Installa

```bash
npm install @mcptoolshop/claude-rpg
```

Oppure esegui direttamente:

```bash
npx @mcptoolshop/claude-rpg play
```

## Avvio rapido

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

Imposta la tua chiave API Anthropic (necessaria solo per la narrazione di Claude):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Cosa c'è di nuovo nella versione 1.6.0?

La versione 1.6 rende reali i dieci mondi, dà un peso reale alla sconfitta e rende il narratore resiliente anche quando la rete non funziona correttamente.

| Funzionalità | Cosa significa |
|---------|--------------|
| **Ten playable worlds** | Iron Colosseum (gladiatore), Jade Veil (ronin) e Crimson Court (vampiro) si uniscono alla lista: dieci mondi, raggruppati per difficoltà nel menu di selezione. |
| **Flag `--world`** | `npx @mcptoolshop/claude-rpg play --world gladiator` salta il menu e ti porta direttamente a un mondo specifico. Dieci alias, tutti elencati in `--help`. |
| **Death is a setback** | La sconfitta in combattimento porta a una schermata di morte distinta e limita le tue azioni finché non risorgi: le campagne terminano intenzionalmente tramite `/conclude`, mai a causa di un singolo combattimento andato male. |
| **Streaming narration** | Il testo viene visualizzato mentre il narratore lo scrive, non dopo. |
| **`/cost` on demand** | Utilizzo e costo stimato dei token di sessione, senza dover spendere nulla per chiedere. |
| **Un indicatore che dice la verità** | Durante i tentativi di riconnessione all'API, l'indicatore animato mostra il tentativo e la causa: "ancora in attesa (tentativo 1/2 - raggiunto il limite di richieste)". In caso di interruzioni prolungate, il testo di fallback passa a un onesto "questo sta ancora succedendo". |
| **Ambient world chatter** | I PNG sullo sfondo svolgono le loro attività: un mercante che controlla i prezzi, una guardia che sorveglia la folla, con elementi specifici per ogni mondo e senza costi aggiuntivi per l'API. |
| **I PNG si ricordano delle cose, anche tra le sessioni di gioco salvate** | La memoria delle conversazioni ora persiste tra il salvataggio e il caricamento: ciò che hai detto alla guardia due sessioni fa influisce ancora su ciò che dice. |
| **Names, not slugs** | La barra di stato, i riepiloghi e le liste dei salvataggi mostrano "Cavaliere penitente", mai `penitent-knight`. Gli indizi sonori vengono letti come parole, mai `white_noise`. |
| **1.542 test** | Aumentati da 625 su 95 file, con soglie di copertura per ogni percorso applicate nel sistema CI (Continuous Integration). |

## Perché è diverso?

| Cosa | Come |
|------|-----|
| **Verità della simulazione separata dalla narrazione** | Il motore risolve il combattimento, il movimento, i dialoghi: Claude narra solo il risultato. Nessun esito frutto di allucinazioni. |
| **Dialogo dei PNG basato sulla cognizione** | Ogni frase pronunciata da un PNG è costruita a partire dalle sue credenze, ricordi, morale, sospetti, fazione e voci. |
| **Presentazione consapevole della percezione** | Claude riceve solo ciò che il personaggio giocatore ha percepito. Le entità con scarsa chiarezza appaiono come figure indistinte, non come bersagli identificati. |
| **Motore di immersione audio/vocale** | I piani narrativi strutturati guidano la sintesi vocale, gli effetti sonori, i livelli ambientali e la musica attraverso voice-soundboard. |
| **Visibilità del direttore sulla verità nascosta** | `/inspect pilgrim` mostra le credenze. `/trace` mostra l'origine. `/divergences` mostra cosa pensavi che fosse successo rispetto a ciò che è realmente accaduto. |
| **Autonomia dei PNG con catene di conseguenze** | I PNG agiscono in base agli obiettivi, tengono traccia degli obblighi e reagiscono quando i punti di svolta della lealtà cambiano. `/npc` e `/people` mostrano i punti di svolta, gli angoli di influenza e le catene di conseguenze attive. |
| **Living districts** | I distretti hanno commercio, morale e sicurezza che cambiano in base alle azioni del giocatore, alle mosse delle fazioni e alle conseguenze degli NPC. L'umore si riflette nella narrazione e influenza il gameplay. `/districts` e `/district` analizzano l'atmosfera del quartiere. |
| **Compagni con rischio di partenza** | I membri del gruppo hanno morale, lealtà e fattori scatenanti per la partenza. Se li si spinge troppo oltre, se ne vanno, per motivi che il motore tiene traccia. |
| **Influenza del giocatore e azioni politiche** | Si può spendere influenza, favori e informazioni in azioni sociali, di diffusione di voci, diplomatiche e di sabotaggio. `/leverage` mostra il proprio capitale politico. |
| **Provenienza degli oggetti e reliquie** | Gli oggetti hanno una storia. Una spada che uccide abbastanza diventa una reliquia con un epitaffio. Gli NPC riconoscono gli oggetti equipaggiati e reagiscono. `/item` analizza la provenienza e registra le informazioni. |
| **Emergent opportunities** | Contratti, taglie, favori, missioni di rifornimento e indagini nascono dalle condizioni del mondo: pressione, scarsità, obiettivi degli NPC, obblighi. Si può accettare, rifiutare, abbandonare o tradire. `/jobs` e `/accepted` tengono traccia dei lavori disponibili e in corso. |
| **Archi narrativi della campagna e finali** | Il motore rileva 10 tipi di archi narrativi (ascesa al potere, caccia, creatore di re, resistenza, ecc.) e 8 classi di risoluzione del finale (vittoria, esilio, rovesciamento, martirio, ecc.) in base allo stato accumulato. `/arcs` mostra la traiettoria. `/conclude` crea un epilogo strutturato con narrazione opzionale tramite LLM. |

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

Il narratore non produce prosa grezza, ma genera un **PianoNarrativo**: una ricetta strutturata che descrive testo, effetti sonori, livelli ambientali, indicazioni musicali e parametri vocali.

| Modulo | Scopo |
|--------|---------|
| **Macchina a stati di presentazione** | Tiene traccia dell'esplorazione, del dialogo, del combattimento e delle conseguenze: gestisce la selezione dei livelli audio. |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking`: inseriscono l'audio in base al contesto. |
| **Voice Caster** | Assegna automaticamente gli NPC alle voci di [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) in base al tipo, al genere e alla fazione. |
| **Audio Director** | Pianifica le indicazioni con priorità, attenuazione del volume e tempi di attesa per evitare spam. |
| **Sound Registry** | Voci audio accessibili tramite indirizzo di contenuto: si possono interrogare in base a tag, umore e intensità. |
| **MCP Bridge** | Traduce i comandi audio in chiamate allo strumento voice-soundboard. |

## Tre modalità

| Modalità | Cosa fa |
|------|-------------|
| **Play** | RPG narrativo immersivo. Claude narra, gli NPC parlano in base alle loro convinzioni e le azioni si risolvono tramite il motore. |
| **Director** | Esamina la verità nascosta: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Ripercorri la cronologia degli eventi mostrando la verità oggettiva e la percezione del giocatore fianco a fianco. |

## Ecosistema

Claude RPG è solo una parte di una più ampia catena di strumenti per creare giochi narrativi basati sulla simulazione:

| Progetto | Cosa fa |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Runtime di simulazione deterministico: 29 moduli, zero dipendenze da LLM. |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Studio di creazione di mondi 2D: editor di mappe, creatore di NPC, renderer, esportazione. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validazione dello schema, test della storyboard, pipeline di esportazione per RPG basati sull'IA. |
| **Claude RPG** (this repo) | Runtime di riferimento: narrazione di Claude, audio immersivo, strumenti del regista. |

## Pacchetti del motore

Claude RPG dipende da questi pacchetti [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Stato, entità, azioni, eventi, regole, RNG. |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 moduli: combattimento, cognizione, percezione, fazioni, voci di corridoio, autonomia degli NPC, compagni, influenza, mappa strategica, riconoscimento degli oggetti, opportunità emergenti. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progressione del personaggio, ferite, reputazione. |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipaggiamento, provenienza degli oggetti, crescita delle reliquie, cronache. |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memoria tra sessioni, effetti sulle relazioni. |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Schema del PianoNarrativo, contratti di rendering. |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Pianificazione dell'audio, priorità, attenuazione del volume. |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro dei pacchetti audio + pacchetto principale. |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validazione dei contenuti del mondo. |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold: mondo di partenza. |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox: mondo di partenza. |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective: mondo di partenza. |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem: mondo di partenza. |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead: mondo di partenza. |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain: mondo di partenza. |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss: mondo di partenza. |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Iron Colosseum: mondo di partenza. |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Jade Veil: mondo di partenza. |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Crimson Court: mondo di partenza. |

## Garanzie del runtime (v1.6.0)

| Garanzia | Applicazione |
|-----------|------------|
| **Il motore risolve prima della narrazione.** | Integrazione con il ciclo di gioco tramite 15 test deterministici. |
| **I file di salvataggio sopravvivono agli aggiornamenti di versione.** | Pipeline di migrazione ordinata, test degli elementi storici, scritture atomiche con ripristino tramite .bak. |
| **Gli errori di Claude diventano messaggi sicuri per il giocatore.** | Adattatore tipizzato `NarrationError` con 9 test sui percorsi di errore, flag `--debug` per la diagnostica. |
| **Lo streaming non può corrompere lo stato.** | Lo stato canonico viene finalizzato prima che il testo trasmesso in streaming abbia importanza; 6 test specifici per lo streaming. |
| **Copertura minima sui percorsi critici.** | CI applica soglie per modulo su sessione, narratore, ciclo di gioco e adattatore LLM. |

## Budget dei token

| Passaggio | Input | Output |
|------|-------|--------|
| Interpretazione dell'azione | ~800 token | ~100 token |
| Narrazione della scena (PianoNarrativo) | ~1400 token | ~300 token |
| Dialogo degli NPC | ~1400 token | ~100 token |
| **Total per turn** | **~3600 token** | **~500 token** |

Modello predefinito: `claude-sonnet-4-20250514`. La generazione del mondo utilizza Opus per la qualità.

## Sicurezza

Claude RPG è un’applicazione CLI locale che effettua chiamate API in uscita verso Anthropic.

- **Dati interessati:** file di salvataggio del giocatore in `~/.claude-rpg/saves/`, API di Anthropic (solo comunicazioni HTTPS in uscita)
- **Dati NON interessati:** nessun dato di telemetria, nessuna analisi, nessun accesso al filesystem al di fuori della directory di salvataggio
- **Chiave API:** letta dalla variabile d’ambiente `ANTHROPIC_API_KEY` — non viene mai memorizzata, registrata o trasmessa al di fuori dell’API di Anthropic
- **Nessun dato sensibile nel codice sorgente** — nessun token, credenziale o chiave API incorporata

Per la politica di sicurezza completa e le informazioni su come segnalare eventuali vulnerabilità, consultare il file [SECURITY.md](SECURITY.md).

## Licenza

MIT

---

Realizzato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
