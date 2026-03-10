<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

这是一款基于模拟的战役角色扮演游戏，Claude负责构建故事，引擎负责维护真实性，而世界则通过传闻、压力、派系、关系、经济和剧情系统不断演变，最终导向有意义的结局。您可以体验它，也可以在此基础上进行开发。

## 什么是Claude RPG？

Claude RPG建立在[AI RPG 引擎](https://github.com/mcp-tool-shop-org/ai-rpg-engine)之上，这是一个具有29个模块的确定性模拟运行时，涵盖战斗、认知、感知、派系、传闻、信念来源、NPC行为、同伴、玩家影响力、战略地图、物品识别、装备来源、 emergent 机会、剧情检测和游戏结束触发器。Claude 的任务是解释、叙述和说话。引擎的任务是维护真实性。

黄金法则：**Claude 提出，引擎执行。**

玩家输入自由文本。Claude 解释意图，引擎以确定性的方式执行操作，感知过滤器决定玩家实际看到的内容，然后 Claude 只叙述角色感知到的内容，并由沉浸式运行时提供语音、音效和环境音效。

NPC 不会背诵剧本。他们根据信念、记忆、派系忠诚度和传闻来表达。他们有原因才撒谎。他们有原因才犹豫不决。他们有原因才拒绝。导演模式允许您查看确切的原因。

## 构建您自己的

Claude RPG 不仅仅是一个游戏，它还是 AI RPG 引擎生态系统的参考实现。将其用作您自己基于模拟的叙事体验的起点。

| 想... | 使用 |
|------------|-----|
| **Play right now** | `npx claude-rpg play --world fantasy` |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — 具有地图编辑器、NPC 构建器和验证功能的 2D 内容创作工作室。 |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — 模式验证、故事板测试、导出流水线。 |
| **Build a custom runtime** | 直接导入 [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 包 — 可以将 Claude 替换为任何 LLM，并添加您自己的用户界面。 |
| **Add new game modules** | 分叉引擎，添加模块到解决流水线，并进行注册。 |

该引擎与 LLM 无关。Claude RPG 使用 Anthropic 模型，但核心引擎不依赖任何 LLM，您可以将其连接到任何模型，甚至可以在完全确定性的模式下运行，而无需叙述。

## 安装

```bash
npm install claude-rpg
```

或者直接运行：

```bash
npx claude-rpg play --world fantasy
```

## 快速开始

```bash
# Play the built-in Chapel Threshold scenario
npx claude-rpg play --world fantasy

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

设置您的 Anthropic API 密钥（仅在需要 Claude 叙述时才需要）：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 它与众不同之处

| 是什么 | 如何 |
|------|-----|
| **模拟真实与叙述分离** | 引擎负责处理战斗、移动、对话，Claude 仅叙述结果。没有虚构的结局。 |
| **基于认知的 NPC 对话** | NPC 每一句对白的构建都基于他们的信念、记忆、士气、怀疑、派系和传闻。 |
| **感知驱动的呈现** | Claude 仅接收玩家角色感知到的信息。低清晰度的实体显示为模糊的人物，而不是命名目标。 |
| **沉浸式音频/语音运行时** | 结构化的叙述计划驱动语音合成、音效、环境音效和音乐，通过语音-音效板实现。 |
| **导演模式可查看隐藏的真相** | `/inspect pilgrim` 显示信念。`/trace` 显示来源。`/divergences` 显示您认为发生的事情与实际发生的事情之间的差异。 |
| **具有连锁后果的 NPC 行为** | NPC 根据目标行动，跟踪义务，并在忠诚度达到临界点时进行反击。`/npc` 和 `/people` 显示临界点、利用角度和主动的连锁后果。 |
| **Living districts** | 地区拥有商业、士气和安全等要素，这些要素会受到玩家行为、派系行动以及NPC事件链的影响。 情绪会融入叙述，并影响游戏进程。 `/districts` 和 `/district` 命令可以查看区域的动态情况。 |
| **有离队风险的同伴** | 队伍成员拥有士气、忠诚度以及离队触发条件。 如果过度逼迫他们，他们就会离开——引擎会记录原因。 |
| **玩家的影响力和政治行动** | 使用影响力、人情和情报来进行社交、传播谣言、外交和破坏等行动。 `/leverage` 命令可以查看您的政治资本。 |
| **装备的来源和遗物** | 物品带有历史。 一把杀够了人的剑会变成带有称号的遗物。 NPC会识别装备的物品并做出反应。 `/item` 命令可以查看物品的来源和历史。 |
| **Emergent opportunities** | 合同、赏金、人情、补给任务和调查任务会根据世界状况产生——例如压力、稀缺、NPC目标、义务。 您可以选择接受、拒绝、放弃或背叛。 `/jobs` 和 `/accepted` 命令可以跟踪可用的和正在进行的任务。 |
| **剧情发展和结局** | 引擎会检测到10种叙事发展类型（例如：崛起、被追捕、幕后操纵、抵抗等），以及8种结局类型（例如：胜利、流放、推翻、殉道等），这些都基于积累的状态。 `/arcs` 命令可以查看发展轨迹。 `/conclude` 命令会生成一个结构化的尾声，并可以选择使用LLM进行叙述。 |

## 架构

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

## Immersion Runtime (v0.2)

叙述器不会直接输出文本，而是会生成一个**叙述计划 (NarrationPlan)**：这是一个结构化的配方，描述了文本、音效、环境音、音乐提示以及语音参数。

| 模块 | 目的 |
|--------|---------|
| **表现状态机 (Presentation State Machine)** | 跟踪探索/对话/战斗/战后情况，并驱动音频层选择。 |
| **Hook Lifecycle** | `enter-room`（进入房间）、`combat-start`（战斗开始）、`combat-end`（战斗结束）、`death`（死亡）、`npc-speaking`（NPC说话）——注入上下文相关的音频。 |
| **Voice Caster** | 根据类型、性别、派系自动将NPC映射到[语音音效库](https://github.com/mcp-tool-shop-org/original_voice-soundboard)中的声音。 |
| **Audio Director** | 安排提示音，包括优先级、静音、冷却时间和防止垃圾信息。 |
| **Sound Registry** | 内容可寻址的音频条目——通过标签、情绪、强度进行查询。 |
| **MCP Bridge** | 将AudioCommands翻译为语音音效库工具的调用。 |

## 三种模式

| 模式 | 作用 |
|------|-------------|
| **Play** | 沉浸式叙事RPG。 Claude进行叙述，NPC根据自己的信念说话，行动通过引擎解决。 |
| **Director** | 检查隐藏的真相：`/inspect <npc>`、`/faction <id>`、`/trace <belief>`、`/divergences`、`/npc <name>`、`/people`、`/districts`、`/district <id>`、`/item <name>`、`/leverage`、`/moves`、`/jobs`、`/accepted` |
| **Replay** | 展示事件时间线，将客观事实与玩家的感知并排显示。 |

## 生态系统

Claude RPG是构建基于模拟的叙事游戏的一个更大工具链中的一部分：

| 项目 | 作用 |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | 确定性模拟运行时——29个模块，不依赖于LLM。 |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | 2D世界创作工作室——地图编辑器、NPC构建器、渲染器、导出功能。 |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | 模式验证、故事板测试、AI RPG导出流水线。 |
| **Claude RPG** (this repo) | 参考运行时——Claude叙述、沉浸式音频、导演工具。 |

## 引擎包

Claude RPG依赖于以下[@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)包：

| 包 | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | 状态、实体、行动、事件、规则、随机数生成器。 |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29个模块——战斗、认知、感知、派系、谣言、NPC自主性、同伴、影响力、战略地图、物品识别、新兴机会。 |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | 角色成长、伤病、声誉 |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | 装备、物品来源、遗物成长、编年史 |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | 跨会话记忆、关系影响 |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | 叙述计划（NarrationPlan）结构、渲染合约 |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | 音频提示调度、优先级、静音 |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | 音效包注册 + 核心包 |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | 世界内容验证 |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold 初始世界 |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox 初始世界 |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective 初始世界 |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem 初始世界 |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead 初始世界 |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain 初始世界 |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss 初始世界 |

## 令牌预算

| 步骤 | 输入 | 输出 |
|------|-------|--------|
| 动作解释 | 约 800 个令牌 | 约 100 个令牌 |
| 场景叙述（NarrationPlan） | 约 1400 个令牌 | 约 300 个令牌 |
| NPC 对话 | 约 1400 个令牌 | 约 100 个令牌 |
| **Total per turn** | **约 3600 个令牌** | **约 500 个令牌** |

默认模型：`claude-sonnet-4-20250514`。 世界生成使用 Opus 以获得更高的质量。

## 安全性

Claude RPG 是一个本地 CLI 应用程序，它会向 Anthropic 发送 API 请求。

- **访问的数据：** 玩家存档文件位于 `~/.claude-rpg/saves/` 目录中，Anthropic API（仅限出站 HTTPS）。
- **未访问的数据：** 不收集任何遥测数据，不进行任何分析，不访问存档目录以外的文件系统。
- **API 密钥：** 从环境变量 `ANTHROPIC_API_KEY` 中读取，永不存储、记录或传输到 Anthropic API 之外。
- **源代码中不包含任何敏感信息：** 不包含任何嵌入的令牌、凭据或 API 密钥。

请参阅 [SECURITY.md](SECURITY.md) 以获取完整的安全策略和漏洞报告。

## 许可证

MIT

---

由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建。
