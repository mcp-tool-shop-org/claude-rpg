<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/claude-rpg"><img src="https://img.shields.io/npm/v/claude-rpg.svg" alt="versão npm"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="Licença: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Página Inicial"></a>
</p>

# Claude RPG

Um RPG de terminal baseado em simulação onde Claude narra, o motor preserva a verdade, e o runtime de imersão orquestra voz, som e apresentação.

## O Que É o Claude RPG?

O Claude RPG funciona sobre o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — um runtime de simulação determinístico com 29 módulos cobrindo combate, cognição, percepção, facções, rumores, proveniência de crenças, agência de NPCs, companheiros, influência do jogador, mapas estratégicos, reconhecimento de itens, proveniência de equipamentos, oportunidades emergentes, detecção de arcos de campanha e gatilhos de final de jogo. O trabalho do Claude é interpretar, narrar e dar voz. O trabalho do motor é ser dono da verdade.

A regra de ouro: **Claude propõe, o motor dispõe.**

Jogadores digitam texto livre. Claude interpreta a intenção, o motor resolve as ações de forma determinística, filtros de percepção decidem o que o jogador realmente viu, e então Claude narra apenas o que o personagem percebeu — com voz, efeitos sonoros e áudio ambiente orquestrados pelo runtime de imersão.

NPCs não recitam roteiros. Eles falam a partir de crenças, memórias, lealdade à facção e rumores. Mentem por motivos. São incertos por motivos. Recusam por motivos. O modo Diretor permite inspecionar exatamente o porquê.

## Instalação

```bash
npm install claude-rpg
```

Ou execute diretamente:

```bash
npx claude-rpg play --world fantasy
```

## Início Rápido

```bash
# Jogue o cenário integrado Chapel Threshold
npx claude-rpg play --world fantasy

# Gere um novo mundo a partir de um prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

Defina sua chave de API da Anthropic:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Por Que É Diferente

| O Quê | Como |
|-------|------|
| **Verdade da simulação separada da narração** | O motor resolve combate, movimentação, diálogo — Claude apenas narra o resultado. Sem resultados alucinados. |
| **Diálogo de NPCs fundamentado em cognição** | Cada fala de NPC é construída a partir de suas crenças, memórias, moral, suspeita, facção e rumores. |
| **Apresentação consciente de percepção** | Claude recebe apenas o que o personagem do jogador percebeu. Entidades de baixa clareza aparecem como figuras sombrias, não como alvos nomeados. |
| **Runtime de imersão com áudio/voz** | Planos de narração estruturados conduzem síntese de voz, efeitos sonoros, camadas de ambiente e música através do voice-soundboard. |
| **Visibilidade do Diretor sobre a verdade oculta** | `/inspect pilgrim` mostra crenças. `/trace` mostra proveniência. `/divergences` mostra o que você achou que aconteceu vs o que realmente aconteceu. |
| **Agência de NPCs com cadeias de consequências** | NPCs agem com base em objetivos, rastreiam obrigações e retaliam quando pontos de ruptura de lealdade mudam. `/npc` e `/people` revelam pontos de ruptura, ângulos de influência e cadeias de consequências ativas. |
| **Distritos vivos** | Distritos possuem comércio, moral e segurança que mudam conforme ações do jogador, movimentos de facções e cadeias de consequências de NPCs. O clima flui para a narração e escala a jogabilidade. `/districts` e `/district` inspecionam o pulso da vizinhança. |
| **Companheiros com risco de partida** | Membros do grupo têm moral, lealdade e gatilhos de partida. Force demais e eles partem — por razões que o motor rastreia. |
| **Influência do jogador e ação política** | Gaste influência, favores e informações em ações sociais, de rumores, diplomacia e sabotagem. `/leverage` mostra seu capital político. |
| **Proveniência de equipamentos e relíquias** | Itens carregam história. Uma espada que mata o suficiente se torna uma relíquia com um epíteto. NPCs reconhecem itens equipados e reagem. `/item` inspeciona proveniência e crônicas. |
| **Oportunidades emergentes** | Contratos, recompensas, favores, missões de suprimento e investigações surgem das condições do mundo — pressão, escassez, objetivos de NPCs, obrigações. Aceite, recuse, abandone ou traia. `/jobs` e `/accepted` rastreiam trabalhos disponíveis e ativos. |
| **Arcos de campanha e finais** | O motor detecta 10 tipos de arcos narrativos (rising-power, hunted, kingmaker, resistance, etc.) e 8 classes de resolução de final (victory, exile, overthrow, martyrdom, etc.) a partir do estado acumulado. `/arcs` mostra a trajetória. `/conclude` renderiza um epílogo estruturado com narração LLM opcional. |

## Arquitetura

```
Jogador digita texto livre
    |
[1] INTERPRETAÇÃO DE AÇÃO (Claude)
    Entrada: texto do jogador + verbos + entidades + saídas
    Saída: { verb, targetIds, confidence }
    |
[2] RESOLUÇÃO DO MOTOR (determinística)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] FILTRAGEM DE PERCEPÇÃO (determinística)
    presentForObserver() -> o que o jogador viu
    |
[4] HOOKS: pré-narração
    Ambiente da zona, alertas de combate, efeitos de morte
    |
[5] PLANO DE NARRAÇÃO (Claude)
    Entrada: cena filtrada + estado de apresentação
    Saída: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] DIRETOR DE ÁUDIO
    Prioridade, ducking, cooldowns -> AudioCommand[]
    |
[7] APRESENTAÇÃO
    Síntese de voz + SFX + ambiente via voice-soundboard
    Renderização de texto no terminal
    |
[8] DIÁLOGO DE NPC (Claude, se falando)
    Fundamentado em cognição: crenças, memórias, facção, rumores
    Voz atribuída por NPC
```

## Runtime de Imersão (v0.2)

O narrador não produz prosa bruta — ele produz um **NarrationPlan**: uma receita estruturada descrevendo texto, efeitos sonoros, camadas de ambiente, dicas musicais e parâmetros de voz.

| Módulo | Propósito |
|--------|-----------|
| **Máquina de Estados de Apresentação** | Rastreia exploração / diálogo / combate / rescaldo — controla a seleção de camadas de áudio |
| **Ciclo de Vida de Hooks** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — injeta áudio contextual |
| **Atribuidor de Voz** | Mapeia NPCs automaticamente para vozes do [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) por tipo, gênero, facção |
| **Diretor de Áudio** | Agenda dicas com prioridade, ducking, cooldowns, anti-spam |
| **Registro de Sons** | Entradas de áudio endereçáveis por conteúdo — consulta por tags, humor, intensidade |
| **Ponte MCP** | Traduz AudioCommands para chamadas de ferramentas do voice-soundboard |

## Três Modos

| Modo | O Que Faz |
|------|-----------|
| **Jogar** | RPG narrativo imersivo. Claude narra, NPCs falam a partir de crenças, ações são resolvidas pelo motor. |
| **Diretor** | Inspecione a verdade oculta: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Percorra a linha do tempo de eventos mostrando verdade objetiva vs percepção do jogador lado a lado. |

## Pacotes do Motor

O Claude RPG depende destes pacotes do [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Pacote | Propósito |
|--------|-----------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Estado, entidades, ações, eventos, regras, RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 módulos — combate, cognição, percepção, facções, rumores, agência de NPCs, companheiros, influência, mapa estratégico, reconhecimento de itens, oportunidades emergentes |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progressão de personagem, ferimentos, reputação |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipamentos, proveniência de itens, evolução de relíquias, crônicas |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memória entre sessões, efeitos de relacionamento |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Esquema de NarrationPlan, contratos de renderização |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Agendamento de dicas de áudio, prioridade, ducking |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro de pacotes de som + pacote principal |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validação de conteúdo de mundo |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Mundo inicial Chapel Threshold |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Mundo inicial Neon Lockbox |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Mundo inicial Gaslight Detective |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Mundo inicial Black Flag Requiem |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Mundo inicial Ashfall Dead |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Mundo inicial Dust Devil's Bargain |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Mundo inicial Signal Loss |

## Orçamento de Tokens

| Etapa | Entrada | Saída |
|-------|---------|-------|
| Interpretação de ação | ~800 tokens | ~100 tokens |
| Narração de cena (NarrationPlan) | ~1400 tokens | ~300 tokens |
| Diálogo de NPC | ~1400 tokens | ~100 tokens |
| **Total por turno** | **~3600 tokens** | **~500 tokens** |

Modelo padrão: `claude-sonnet-4-20250514`. A geração de mundos usa Opus para maior qualidade.

## Segurança

O Claude RPG é uma aplicação CLI local que faz chamadas de API para a Anthropic.

- **Dados acessados:** arquivos de save do jogador em `~/.claude-rpg/saves/`, API da Anthropic (apenas HTTPS de saída)
- **Dados NÃO acessados:** sem telemetria, sem analytics, sem acesso ao sistema de arquivos fora do diretório de saves
- **Chave de API:** lida a partir da variável de ambiente `ANTHROPIC_API_KEY` — nunca armazenada, registrada ou transmitida além da API da Anthropic
- **Sem segredos no código-fonte** — sem tokens, credenciais ou chaves de API embutidos

Consulte [SECURITY.md](SECURITY.md) para a política de segurança completa e relato de vulnerabilidades.

## Licença

MIT

---

Desenvolvido por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
