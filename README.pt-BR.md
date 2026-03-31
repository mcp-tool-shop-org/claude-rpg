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

Um RPG de campanha baseado em simulação, onde Claude cria a narrativa, o motor garante a veracidade e os mundos evoluem através de rumores, pressão, facções, relacionamentos, economia e sistemas de progressão, levando a conclusões significativas. Jogue ou crie algo novo a partir dele.

## O que é Claude RPG?

Claude RPG é construído sobre o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — um ambiente de simulação determinístico com 29 módulos que abrangem combate, cognição, percepção, facções, rumores, origem das crenças, autonomia dos NPCs, companheiros, influência do jogador, mapas estratégicos, reconhecimento de itens, origem dos equipamentos, oportunidades emergentes, detecção de arcos de campanha e gatilhos para o final do jogo. A função de Claude é interpretar, narrar e falar. A função do motor é garantir a veracidade.

A regra de ouro: **Claude propõe, o motor decide.**

Os jogadores digitam texto livre. Claude interpreta a intenção, o motor resolve as ações de forma determinística, os filtros de percepção decidem o que o jogador realmente viu, e então Claude narra apenas o que o personagem percebeu — com voz, efeitos sonoros e áudio ambiente, tudo orquestrado pelo ambiente de imersão.

Os NPCs não recitam roteiros. Eles falam com base em crenças, memórias, lealdade a facções e rumores. Eles mentem por motivos. Eles estão incertos por motivos. Eles se recusam por motivos. O modo de diretor permite que você veja exatamente por quê.

## Crie o Seu

Claude RPG não é apenas um jogo — é uma implementação de referência para o ecossistema do AI RPG Engine. Use-o como ponto de partida para suas próprias experiências narrativas baseadas em simulação.

| Quer... | Usar |
|------------|-----|
| **Play right now** | `npx claude-rpg play` (seleção interativa de mundo e personagem) |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — estúdio de criação 2D com editor de mapas, construtor de NPCs e validação. |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — validação de esquema, testes de storyboard, pipelines de exportação. |
| **Build a custom runtime** | Importe pacotes do [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) diretamente — substitua Claude por qualquer LLM, adicione sua própria interface. |
| **Add new game modules** | Faça um fork do motor, adicione módulos ao pipeline de resolução e registre-os. |

O motor é agnóstico em relação aos LLMs. Claude RPG usa modelos da Anthropic, mas o motor principal não tem dependências de LLMs — você pode conectá-lo a qualquer modelo ou até mesmo executá-lo de forma totalmente determinística, sem narração.

## Instalar

```bash
npm install claude-rpg
```

Ou execute diretamente:

```bash
npx claude-rpg play
```

## Início Rápido

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

Defina sua chave de API da Anthropic (necessária apenas para a narração do Claude):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Novidades na versão 1.5.0

A versão 1.5 é uma versão otimizada para ambientes distribuídos, com 67 correções de bugs, 22 melhorias de segurança e três conjuntos de recursos que tornam o jogo mais dinâmico.

| Recurso | O que isso significa |
|---------|--------------|
| **API retry with backoff** | Falhas temporárias na API Claude são automaticamente retentadas com um sistema de espera exponencial e variação. |
| **Periodic autosave** | O estado do jogo é salvo em intervalos configuráveis. Acabaram-se as perdas de progresso devido a travamentos ou desconexões. |
| **Fast-path inventory** | Ações comuns (usar, equipar, descartar, examinar) são resolvidas instantaneamente, sem a necessidade de uma consulta à LLM. |
| **Terminal colors + spinner** | Cores ANSI para dano, cura e nomes de NPCs. Indicador de carregamento animado durante as chamadas da LLM. |
| **Tab completion** | Autocompletar para comandos, nomes de NPCs, itens e locais. |
| **NPC voice archetypes** | Padrões de fala distintos para cada tipo de NPC: erudito, rude, comerciante, nobre e outros. |
| **NPC conversation memory** | Os NPCs se lembram do que você disse e fazem referência a conversas anteriores em diálogos futuros. |
| **Token/cost tracking** | Uso de tokens por turno e cumulativo, com custo estimado, exibido sob demanda. |
| **Turn history compaction** | Turnos anteriores são resumidos para manter as janelas de contexto eficientes, sem perder a linha narrativa. |
| **Sistema de missões + NPCs de fundo** | Objetivos das missões rastreados no contexto da narrativa. NPCs de fundo conversam com base no clima do distrito. |
| **625 testes** | Aumentado de 209 para 625, distribuídos em 53 arquivos de teste. Correções de bugs, contenção de erros, degradação graciosa e observabilidade, tudo testado e aprimorado por uma equipe interna. |

## O que o torna diferente

| O que | Como |
|------|-----|
| **Veracidade da simulação separada da narração** | O motor resolve o combate, o movimento, o diálogo — Claude apenas narra o resultado. Sem resultados inventados. |
| **Diálogo do NPC baseado na cognição** | Cada linha do diálogo do NPC é construída a partir de suas crenças, memórias, moral, suspeitas, facção e rumores. |
| **Apresentação com consciência da percepção** | Claude recebe apenas o que o personagem do jogador percebeu. Entidades de baixa clareza aparecem como figuras sombrias, não como alvos nomeados. |
| **Ambiente de imersão de áudio/voz** | Planos de narração estruturados impulsionam a síntese de voz, efeitos sonoros, camadas de ambiente e música através do voice-soundboard. |
| **Visibilidade do diretor para a verdade oculta** | `/inspect pilgrim` mostra crenças. `/trace` mostra a origem. `/divergences` mostra o que você pensou que aconteceu versus o que realmente aconteceu. |
| **Autonomia do NPC com cadeias de consequências** | Os NPCs agem com base em objetivos, rastreiam obrigações e retaliam quando os limites de lealdade mudam. `/npc` e `/people` revelam os limites, os pontos de alavancagem e as cadeias de consequências ativas. |
| **Living districts** | Os distritos possuem comércio, moral e segurança que variam de acordo com as ações do jogador, as movimentações das facções e as consequências das ações dos NPCs. O estado de espírito influencia a narrativa e afeta a jogabilidade. Os comandos `/distritos` e `/distrito` permitem analisar o "pulso" do bairro. |
| **Companheiros com risco de partida** | Os membros do grupo possuem moral, lealdade e gatilhos que podem levar à sua partida. Se você os pressionar demais, eles podem ir embora — e o sistema registra os motivos. |
| **Influência do jogador e ações políticas** | Utilize influência, favores e informações para realizar ações sociais, espalhar rumores, praticar diplomacia ou sabotagem. O comando `/influência` mostra seu capital político. |
| **Origem dos equipamentos e relíquias** | Os itens possuem história. Uma espada que causa muitas mortes pode se tornar uma relíquia com um epitáfio. Os NPCs reconhecem os itens equipados e reagem a eles. O comando `/item` permite verificar a origem e o histórico do item. |
| **Emergent opportunities** | Contratos, recompensas, favores, missões de suprimento e investigações surgem das condições do mundo — pressão, escassez, objetivos dos NPCs, obrigações. Você pode aceitar, recusar, abandonar ou trair. Os comandos `/trabalhos` e `/aceitos` rastreiam as tarefas disponíveis e as tarefas em andamento. |
| **Arcos narrativos e finais de jogo** | O sistema detecta 10 tipos de arcos narrativos (ascensão ao poder, caçado, criador de reis, resistência, etc.) e 8 classes de resolução final (vitória, exílio, derrubada, martírio, etc.), com base no estado acumulado. O comando `/arcos` mostra a trajetória. O comando `/concluir` gera um epílogo estruturado com narração opcional gerada por um modelo de linguagem. |

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

O narrador não produz prosa diretamente — ele gera um **Plano de Narração**: uma receita estruturada que descreve texto, efeitos sonoros, camadas de ambiente, dicas musicais e parâmetros de voz.

| Módulo | Propósito |
|--------|---------|
| **Máquina de Estados de Apresentação** | Monitora a exploração / diálogo / combate / consequências — controla a seleção da camada de áudio. |
| **Hook Lifecycle** | `entrar-no-quarto`, `início-do-combate`, `fim-do-combate`, `morte`, `npc-falando` — injeta áudio contextualizado. |
| **Voice Caster** | Mapeia automaticamente os NPCs para vozes no [painel de som](https://github.com/mcp-tool-shop-org/original_voice-soundboard) com base no tipo, gênero e facção. |
| **Audio Director** | Agenda as pistas com prioridade, supressão, tempo de recarga e anti-spam. |
| **Sound Registry** | Entradas de áudio endereçáveis por conteúdo — pesquisa por tags, humor e intensidade. |
| **MCP Bridge** | Traduz os comandos de áudio para as chamadas do painel de som. |

## Três Modos

| Modo | O que ele faz |
|------|-------------|
| **Play** | RPG narrativo imersivo. Claude narra, os NPCs falam de acordo com suas crenças, e as ações são resolvidas pelo sistema. |
| **Director** | Investigue a verdade oculta: `/inspecionar <npc>`, `/facção <id>`, `/rastrear <crença>`, `/divergências`, `/npc <nome>`, `/pessoas`, `/distritos`, `/distrito <id>`, `/item <nome>`, `/influência`, `/movimentos`, `/trabalhos`, `/aceitos`. |
| **Replay** | Visualize a linha do tempo dos eventos, mostrando a verdade objetiva versus a percepção do jogador lado a lado. |

## Ecossistema

Claude RPG é uma parte de um conjunto de ferramentas maior para criar jogos narrativos baseados em simulação:

| Projeto | O que ele faz |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Runtime de simulação determinística — 29 módulos, sem dependências de modelos de linguagem. |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Estúdio de criação de mundos 2D — editor de mapas, criador de NPCs, renderizador, exportação. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validação de esquema, testes de storyboard, pipelines de exportação de RPGs com IA. |
| **Claude RPG** (this repo) | Runtime de referência — narração de Claude, áudio imersivo, ferramentas de direção. |

## Pacotes do Motor

Claude RPG depende destes pacotes [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Pacote | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Estado, entidades, ações, eventos, regras, RNG. |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 módulos — combate, cognição, percepção, facções, rumores, agência dos NPCs, companheiros, influência, mapa estratégico, reconhecimento de itens, oportunidades emergentes. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progressão do personagem, lesões, reputação. |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipamentos, origem dos itens, crescimento de relíquias, crônicas. |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memória entre sessões, efeitos de relacionamento. |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Esquema de narração (NarrationPlan), contratos de renderização. |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Agendamento de sinais de áudio, prioridade, atenuação. |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro de pacotes de áudio + pacote principal. |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validação do conteúdo do mundo. |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Mundo inicial "Chapel Threshold". |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Mundo inicial "Neon Lockbox". |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Mundo inicial "Gaslight Detective". |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Mundo inicial "Black Flag Requiem". |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Mundo inicial "Ashfall Dead". |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Mundo inicial "Dust Devil's Bargain". |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Mundo inicial "Signal Loss". |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Mundo inicial "Iron Colosseum". |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Mundo inicial "Jade Veil". |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Mundo inicial "Crimson Court". |

## Garantias de Execução (versão 1.5.0)

| Garantia | Implementação |
|-----------|------------|
| **O motor resolve antes da narrativa** | Harnês de integração do ciclo de turno com 15 testes determinísticos. |
| **Os arquivos de salvamento sobrevivem a mudanças de versão** | Pipeline de migração ordenado, testes históricos de fixtures, escritas atômicas com recuperação .bak. |
| **Falhas na Claude se tornam mensagens seguras para o jogador** | Adaptador `NarrationError` com 9 testes de caminhos de erro, flag `--debug` para diagnóstico. |
| **O streaming não pode corromper o estado** | O estado canônico é finalizado antes que o texto transmitido seja relevante; 6 testes específicos para streaming. |
| **Cobertura mínima em caminhos críticos** | O sistema de integração contínua (CI) impõe limites por módulo para sessão, narrador, ciclo de turno e adaptador LLM. |

## Orçamento de tokens

| Etapa. | Entrada. | Saída. |
|------|-------|--------|
| Interpretação da ação. | ~800 tokens. | ~100 tokens. |
| Narração da cena (NarrationPlan). | ~1400 tokens. | ~300 tokens. |
| Diálogo de NPCs. | ~1400 tokens. | ~100 tokens. |
| **Total per turn** | **~3600 tokens** | **~500 tokens** |

Modelo padrão: `claude-sonnet-4-20250514`. A geração de mundos usa Opus para qualidade.

## Segurança

Claude RPG é uma aplicação CLI local que faz chamadas de API de saída para a Anthropic.

- **Dados acessados:** arquivos de salvamento do jogador em `~/.claude-rpg/saves/`, API da Anthropic (apenas HTTPS de saída).
- **Dados NÃO acessados:** nenhuma telemetria, nenhuma análise, nenhum sistema de arquivos fora do diretório de salvamento.
- **Chave da API:** lida da variável de ambiente `ANTHROPIC_API_KEY` — nunca armazenada, registrada ou transmitida além da API da Anthropic.
- **Sem segredos no código-fonte** — sem tokens, credenciais ou chaves de API incorporados.

Consulte [SECURITY.md](SECURITY.md) para a política de segurança completa e para relatar vulnerabilidades.

## Licença

MIT.

---

Criado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
