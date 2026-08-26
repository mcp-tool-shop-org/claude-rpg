<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

Um RPG de campanha baseado em simulação, onde Claude cria a história, o motor preserva a verdade e os mundos evoluem através de rumores, pressão, facções, relacionamentos, economia e sistemas de arcos narrativos, levando a conclusões significativas. Jogue ou construa sobre ele.

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/claude-rpg/main/site/public/banner.jpg" width="800" alt="Ten glowing world-gates in a dark gallery — a lone traveler with a lantern chooses between them">
</p>

<p align="center"><em>Ten worlds. One narrator. The engine keeps the truth.</em></p>

## O que é Claude RPG?

Claude RPG se baseia no [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — um motor de simulação determinístico com 29 módulos que abrangem combate, cognição, percepção, facções, rumores, origem das crenças, agência de NPCs, companheiros, influência do jogador, mapas estratégicos, reconhecimento de itens, origem dos equipamentos, oportunidades emergentes, detecção de arcos narrativos da campanha e gatilhos finais. O trabalho de Claude é interpretar, narrar e falar. O trabalho do motor é manter a verdade.

A regra de ouro: **Claude propõe, o motor decide.**

Os jogadores digitam texto livremente. Claude interpreta a intenção, o motor resolve as ações deterministicamente, os filtros de percepção decidem o que o jogador realmente viu e, em seguida, Claude narra apenas o que o personagem percebeu — com voz, efeitos sonoros e áudio ambiente criados pelo motor de imersão.

Os NPCs não recitam roteiros. Eles falam a partir de crenças, memórias, lealdade à facção e rumores. Eles mentem por motivos. Eles estão incertos por motivos. Eles se recusam por motivos. O modo Diretor permite que você inspecione exatamente o porquê.

## Crie o Seu Próprio

Claude RPG não é apenas um jogo — é uma implementação de referência para o ecossistema AI RPG Engine. Use-o como ponto de partida para suas próprias experiências narrativas baseadas em simulação.

| Quer... | Usar |
|------------|-----|
| **Play right now** | `npx claude-rpg play` (seleção interativa de mundo e personagem) |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — estúdio de criação 2D com editor de mapas, criador de NPCs e validação |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — validação de esquema, teste de storyboard, pipelines de exportação |
| **Build a custom runtime** | Importe pacotes [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) diretamente — substitua Claude por qualquer LLM, adicione sua própria interface de usuário |
| **Add new game modules** | Faça um fork do motor, adicione módulos ao pipeline de resolução e registre-os |

O motor é agnóstico em relação a LLMs. Claude RPG usa modelos Anthropic, mas o motor principal não tem dependências de LLM — você pode conectá-lo a qualquer modelo ou até mesmo executá-lo totalmente deterministicamente sem narração.

## Instale

```bash
npm install claude-rpg
```

Ou execute diretamente:

```bash
npx claude-rpg play
```

## Começo Rápido

```bash
# Play — interactive world and character selection (ten worlds, grouped by difficulty)
npx claude-rpg play

# Jump straight into a named world
npx claude-rpg play --world gladiator

# Accelerated campaign pacing
npx claude-rpg play --fast

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

Defina sua chave de API Anthropic (necessária apenas para a narração de Claude):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## O que há de novo na v1.6.0

A v1.6 torna o conjunto de dez mundos real, dá peso real à derrota e torna o narrador resiliente quando a rede não está disponível.

| Recurso | O que significa |
|---------|--------------|
| **Ten playable worlds** | Coliseu de Ferro (gladiador), Véu de Jade (ronin) e Corte Carmesim (vampiro) se juntam ao elenco — dez mundos, agrupados por dificuldade no seletor. |
| **Flag `--world`** | `npx claude-rpg play --world gladiator` ignora o menu e vai direto para um mundo específico. Dez aliases, todos listados em `--help`. |
| **Death is a setback** | Cair em combate leva a uma tela de morte distinta e limita suas ações até que você se levante — as campanhas terminam deliberadamente através de `/conclude`, nunca por causa de uma única luta ruim. |
| **Streaming narration** | A prosa é renderizada enquanto o narrador a escreve, não depois. |
| **`/cost` sob demanda** | Uso do token da sessão e gasto estimado, sem gastar nada para perguntar. |
| **Um indicador que diz a verdade** | Durante as tentativas de API, o indicador de "pensamento" relata a tentativa e a causa — "ainda pensando (tentativa 1/2 — limite de taxa atingido)". Falhas prolongadas alternam a prosa de fallback para um honesto "isso ainda está acontecendo". |
| **Ambient world chatter** | NPCs de fundo seguem com suas vidas — um mercador verificando os preços, um guarda examinando a multidão — com sabor específico para cada mundo, sem custo de API. |
| **NPCs se lembram, mesmo entre salvamentos** | A memória da conversa agora persiste durante o salvamento/carregamento: o que você disse ao guarda duas sessões atrás ainda influencia o que ele diz. |
| **Names, not slugs** | A barra de status, os resumos e as listas de salvamento mostram "Cavaleiro Penitente", nunca `penitent-knight`. As dicas sonoras são lidas como palavras, nunca `white_noise`. |
| **1.542 testes** | Aumentou de 625 em 95 arquivos, com limites mínimos de cobertura por caminho aplicados no CI. |

## Por que é diferente

| O quê | Como |
|------|-----|
| **Verdade da simulação separada da narração** | O motor resolve o combate, o movimento, o diálogo — Claude apenas narra o resultado. Sem resultados alucinados. |
| **Diálogo de NPC fundamentado na cognição** | Cada linha do discurso dos NPCs é construída a partir de suas crenças, memórias, moral, suspeita, facção e rumores. |
| **Apresentação consciente da percepção** | Claude recebe apenas o que o personagem jogador percebeu. Entidades de baixa clareza aparecem como figuras sombrias, não como alvos nomeados. |
| **Motor de imersão de áudio/voz** | Planos de narração estruturados impulsionam a síntese de voz, os efeitos sonoros, as camadas ambientais e a música através do voice-soundboard. |
| **Visibilidade do diretor sobre a verdade oculta** | `/inspect pilgrim` mostra crenças. `/trace` mostra a origem. `/divergences` mostra o que você pensou que aconteceu em comparação com o que realmente aconteceu. |
| **Agência de NPC com cadeias de consequências** | Os NPCs agem com base em objetivos, rastreiam obrigações e retaliam quando os pontos de ruptura de lealdade mudam. `/npc` e `/people` revelam os pontos de ruptura, os ângulos de influência e as cadeias de consequências ativas. |
| **Living districts** | Distritos possuem comércio, moral e segurança que mudam de acordo com as ações do jogador, os movimentos das facções e as consequências dos NPCs. O humor influencia a narrativa e ajusta a jogabilidade. `/districts` e `/district` inspecionam o pulso do bairro. |
| **Companheiros com risco de partida** | Membros do grupo têm moral, lealdade e gatilhos para a partida. Se você os pressionar demais, eles partirão — por motivos que o motor registra. |
| **Influência do jogador e ação política** | Gaste influência, favores e informações em ações sociais, de boatos, diplomáticas e de sabotagem. `/leverage` mostra seu capital político. |
| **Origem dos equipamentos e relíquias** | Os itens carregam história. Uma espada que mata o suficiente se torna uma relíquia com um epíteto. Os NPCs reconhecem os itens equipados e reagem. `/item` inspeciona a origem e registra os eventos. |
| **Emergent opportunities** | Contratos, recompensas, favores, missões de suprimentos e investigações surgem das condições do mundo — pressão, escassez, objetivos dos NPCs, obrigações. Aceite, recuse, abandone ou traia. `/jobs` e `/accepted` rastreiam o trabalho disponível e em andamento. |
| **Arcos da campanha e finais** | O motor detecta 10 tipos de arcos narrativos (ascensão ao poder, caçado, criador de reis, resistência, etc.) e 8 classes de resolução final (vitória, exílio, derrubada, martírio, etc.) a partir do estado acumulado. `/arcs` mostra a trajetória. `/conclude` renderiza um epílogo estruturado com narração opcional do LLM. |

## Arquitetura

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

## Runtime de Imersão (v0.2)

O narrador não produz prosa bruta — ele gera um **Plano de Narração**: uma receita estruturada que descreve texto, efeitos sonoros, camadas ambientais, dicas musicais e parâmetros de voz.

| Módulo | Propósito |
|--------|---------|
| **Máquina de Estado de Apresentação** | Rastreia exploração / diálogo / combate / consequências — direciona a seleção da camada de áudio. |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — injeta áudio com consciência do contexto. |
| **Voice Caster** | Mapeia automaticamente os NPCs para as vozes do [painel de sons](https://github.com/mcp-tool-shop-org/original_voice-soundboard) por tipo, gênero e facção. |
| **Audio Director** | Agenda dicas com prioridade, atenuação, tempo de espera e proteção contra spam. |
| **Sound Registry** | Entradas de áudio endereçáveis por conteúdo — consulta por tags, humor e intensidade. |
| **MCP Bridge** | Traduz AudioCommands para chamadas de ferramenta do voice-soundboard. |

## Três Modos

| Modo | O que ele faz |
|------|-------------|
| **Play** | RPG narrado imersivo. Claude narra, os NPCs falam com base em suas crenças e as ações são resolvidas pelo motor. |
| **Director** | Inspecione a verdade oculta: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Percorra a linha do tempo dos eventos mostrando a verdade objetiva versus a percepção do jogador lado a lado. |

## Ecossistema

Claude RPG é uma parte de um conjunto de ferramentas maior para construir jogos narrativos baseados em simulação:

| Projeto | O que ele faz |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Runtime de simulação determinística — 29 módulos, sem dependências do LLM. |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Estúdio de criação de mundo 2D — editor de mapa, criador de NPCs, renderizador e exportação. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validação de esquema, testes de storyboard, pipelines de exportação de RPG com IA. |
| **Claude RPG** (this repo) | Runtime de referência — narração de Claude, áudio imersivo, ferramentas de direção. |

## Pacotes do Motor

Claude RPG depende destes pacotes [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Pacote | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Estado, entidades, ações, eventos, regras, RNG. |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 módulos — combate, cognição, percepção, facções, boatos, agência de NPCs, companheiros, influência, mapa estratégico, reconhecimento de itens, oportunidades emergentes. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progressão do personagem, ferimentos, reputação. |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipamento, origem dos itens, crescimento das relíquias, crônicas. |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memória entre sessões, efeitos de relacionamento. |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Esquema do NarrationPlan, contratos de renderização. |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Agendamento de dicas de áudio, prioridade, atenuação. |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro de pacotes de som + pacote principal. |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validação do conteúdo do mundo. |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold, mundo inicial. |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox, mundo inicial. |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective, mundo inicial. |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem, mundo inicial. |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead, mundo inicial. |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain, mundo inicial. |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss, mundo inicial. |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Iron Colosseum, mundo inicial. |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Jade Veil, mundo inicial. |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Crimson Court, mundo inicial. |

## Garantias do Runtime (v1.6.0)

| Garantia | Aplicação |
|-----------|------------|
| **O motor resolve antes da narração** | Conjunto de integração de loop de turno com 15 testes determinísticos. |
| **Os arquivos salvos sobrevivem à mudança de versão** | Pipeline de migração ordenada, testes de fixture histórico, gravações atômicas com recuperação .bak. |
| **As falhas do Claude se tornam mensagens seguras para o jogador** | Adaptador `NarrationError` tipado com 9 testes de caminho de erro, flag `--debug` para diagnóstico. |
| **O streaming não pode corromper o estado** | Estado canônico finalizado antes que o texto transmitido importe; 6 testes específicos do streaming. |
| **Cobertura mínima nos caminhos críticos** | CI aplica limites por módulo em sessão, narrador, loop de turno e adaptador LLM. |

## Orçamento de Tokens

| Etapa | Entrada | Saída |
|------|-------|--------|
| Interpretação da ação | ~800 tokens | ~100 tokens |
| Narração da cena (Plano de Narração) | ~1400 tokens | ~300 tokens |
| Diálogo do NPC | ~1400 tokens | ~100 tokens |
| **Total per turn** | **~3600 tokens** | **~500 tokens** |

Modelo padrão: `claude-sonnet-4-20250514`. A geração de mundo usa Opus para qualidade.

## Segurança

Claude RPG é uma aplicação CLI local que faz chamadas de API para a Anthropic.

- **Dados acessados:** arquivos de salvamento do jogador em `~/.claude-rpg/saves/`, API da Anthropic (apenas chamadas HTTPS de saída)
- **Dados NÃO acessados:** sem telemetria, sem análise de dados, sem acesso ao sistema de arquivos fora do diretório de salvamento
- **Chave de API:** lida a partir da variável de ambiente `ANTHROPIC_API_KEY` — nunca armazenada, registada ou transmitida além da API da Anthropic
- **Sem informações confidenciais no código fonte** — sem tokens, credenciais ou chaves de API incorporadas

Consulte [SECURITY.md](SECURITY.md) para obter a política de segurança completa e as informações sobre como relatar vulnerabilidades.

## Licença

MIT

---

Desenvolvido por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
