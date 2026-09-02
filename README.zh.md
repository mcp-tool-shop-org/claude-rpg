<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/claude-rpg/main/site/public/banner.jpg" width="800" alt="Ten glowing world-gates in a dark gallery — a lone traveler with a lantern chooses between them">
</p>

<p align="center"><em>Twelve worlds. One narrator. The engine keeps the truth.</em></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/claude-rpg"><img src="https://img.shields.io/npm/v/%40mcptoolshop%2Fclaude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# 克劳德 RPG

一款基于模拟的战役 RPG，克劳德负责构建故事，引擎维护真相，世界通过谣言、压力、派系、关系、经济和剧情系统演变，最终走向有意义的结局。你可以玩它，也可以在此基础上进行构建。


## 什么是克劳德 RPG？

克劳德 RPG 建立在 [AI RPG 引擎](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 之上——这是一个确定性模拟运行时环境，包含 29 个模块，涵盖战斗、认知、感知、派系、谣言、信仰来源、NPC 行为、伙伴、玩家影响力、战略地图、物品识别、装备来源、新兴机会、战役剧情检测和结局触发。克劳德的任务是解释、叙述和表达。引擎的任务是维护真相。

黄金法则：**克劳德提出，引擎决定。**

玩家输入自由文本。克劳德解释意图，引擎以确定性的方式解析行动，感知过滤器决定玩家实际看到了什么，然后克劳德仅叙述角色所感知的内容——通过沉浸式运行时环境呈现声音、音效和环境音频。

NPC 不会背诵剧本。他们根据自己的信仰、记忆、派系忠诚度和谣言进行发言。他们有理由说谎。他们有理由感到不确定。他们有理由拒绝。导演模式可以让你准确地了解原因。

## 构建你自己的游戏

克劳德 RPG 不仅仅是一款游戏——它还是 AI RPG 引擎生态系统的一个参考实现。将其作为你自己的基于模拟的叙事体验的起点。

| 你想…… | 使用 |
|------------|-----|
| **Play right now** | `npx @mcptoolshop/claude-rpg play`（交互式世界和角色选择） |
| **Create a new world** | `npx @mcptoolshop/claude-rpg new "your world concept"` |
| **Author worlds visually** | [世界工坊](https://github.com/mcp-tool-shop-org/world-forge)——一个 2D 创作工作室，带有地图编辑器、NPC 构建器和验证工具。 |
| **Validate world data** | [正典档案](https://github.com/mcp-tool-shop-org/cannon-archive)——模式验证、故事板测试、导出流水线。 |
| **Build a custom runtime** | 直接导入 [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 包——将克劳德替换为任何 LLM，添加你自己的 UI。 |
| **Add new game modules** | 分叉引擎，向解析流水线中添加模块，并进行注册。 |

该引擎与 LLM 无关。克劳德 RPG 使用 Anthropic 模型，但核心引擎没有任何 LLM 依赖——你可以将其连接到任何模型，甚至可以完全确定性地运行，而无需叙述。

## 安装

```bash
npm install @mcptoolshop/claude-rpg
```

或者直接运行：

```bash
npx @mcptoolshop/claude-rpg play
```

## 快速入门

```bash
# Play — interactive world and character selection (twelve worlds, grouped by difficulty)
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

设置你的 Anthropic API 密钥（仅用于克劳德的叙述）：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## v2.0.0 版本的新功能

v2.0 是“动态世界”版本：世界以游戏引擎自身的节奏运行，街道会对你的行为做出反应，并且你之前保存的所有游戏进度都可以加载。

| 特性 | 其含义 |
|---------|--------------|
| **世界以自身的节奏运行** | 生成的世界拥有与初始包相同的完整模块系列，游戏引擎自身的节奏驱动着各种事件、机遇、遭遇和派系行动，并且每个游戏会话都是对世界真实情况的呈现。 |
| **Enemies act** | 具有攻击意识的敌人会在攻击前一回合发出信号；一个独立的对话频道会显示你的结果、击杀数、命中数以及接下来会发生什么。 |
| **Asks and recognition** | 需要帮助的请求者和看起来与他们一模一样的骗子——线索会被植入，真相会在稍后以特定的代价揭晓。帮助真正的请求者，游戏会立即告知；如果置之不理，则会流传谣言，之后会得到回报，并获得荣誉。 |
| **The street answers you** | 未知的命令会在不消耗回合的情况下立即得到响应；在刚刚说话的 NPC 面前输入一句话，即为对话；仅输入一个名字，NPC 就会说话；仅输入一个“退出”命令，NPC 就会离开；`/go <exit>` 和 `/rumors` 在游戏模式中有效；一个引用的市场价格会显示在位置信息中。 |
| **Rumors with a stance** | NPC 会听到谣言，并根据他们是否相信或怀疑来做出反应，谣言会传播到相邻的区域——两者都受到一个衡量标准的控制。 |
| **A tuning surface** | 每个“动态世界”的参数都设置为一个默认值，`/tuning` 用于读取这些参数，并且所有十三個世界都使用一个确定的 30 回合矩阵。敌人的伤害值在该标准中被调整为 0.5。 |
| **Save schema v3** | 谣言引擎会保留游戏进度，每个 1.x 版本的游戏进度都会以完整的形式迁移，并且生成的世界会从停止的地方继续。 |
| **由五个模型系列进行测试** | 四个 AI 模型系列（Mistral、Qwen、Llama、DeepSeek、Gemini，每个系列进行 40 回合的测试）取代了人工测试，并塑造了最后两个阶段。 |
| **2,495 次测试** | 从 121 个文件中的 1,870 次测试开始，每个阶段都通过一个由不同模型组成的评审团和一个确定的标准来完成。 |

## 它与众不同之处

| 是什么 | 它是如何做到的 |
|------|-----|
| **模拟真相与叙述分离** | 引擎解析战斗、移动和对话——克劳德仅叙述结果。没有虚构的结果。 |
| **NPC 对话基于认知** | NPC 说的每一句话都是根据他们的信仰、记忆、士气、怀疑、派系和谣言构建的。 |
| **感知感知的呈现方式** | 克劳德只会接收玩家角色所感知的内容。低清晰度的实体会显示为模糊的身影，而不是命名目标。 |
| **音频/语音沉浸式运行时环境** | 结构化的叙述计划通过 voice-soundboard 驱动语音合成、音效、环境层和音乐。 |
| **导演可以查看隐藏的真相** | `/inspect pilgrim` 显示信仰。`/trace` 显示来源。`/divergences` 显示你认为发生了什么与实际发生的情况。 |
| **具有后果链的 NPC 行为** | NPC 会根据目标采取行动，跟踪义务，并在忠诚度突破点发生变化时进行报复。`/npc` 和 `/people` 显示突破点、影响力角度和活动后果链。 |
| **Living districts** | 各个区域的商业、士气和安全会随着玩家的行为、派系行动以及 NPC 的连锁反应而变化。情绪会影响叙事，并调整游戏玩法。`/districts` 和 `/district` 会检查该地区的动态。 |
| **有离队风险的伙伴** | 小队成员拥有士气、忠诚度和离队触发条件。如果过度压榨他们，他们就会离开——原因由游戏引擎记录。 |
| **玩家的影响力和政治行动** | 将影响力、人情和情报用于社交、谣言、外交和破坏行动。`/leverage` 显示你的政治资本。 |
| **装备的来源和遗物** | 物品承载着历史。一把杀过足够多敌人的剑会变成带有铭文的遗物。NPC 会识别装备并做出反应。`/item` 检查来源并记录历史。 |
| **Emergent opportunities** | 合同、赏金、人情、补给任务和调查都源于世界状况——压力、稀缺性、NPC 的目标、义务。接受、拒绝、放弃或背叛。`/jobs` 和 `/accepted` 会跟踪可用的和正在进行的工作。 |
| **剧情主线和结局** | 游戏引擎会根据累积的状态检测出 10 种叙事弧类型（崛起、被追捕、幕后推手、抵抗等）和 8 种结局类别（胜利、流放、推翻、殉道等）。`/arcs` 显示剧情走向。`/conclude` 会渲染一个结构化的尾声，并可选地使用 LLM 进行叙述。 |

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

## 沉浸式运行时 (v0.2)

叙述者不会输出原始文本——它会生成一个 **叙事计划**：一种结构化的配方，描述了文本、音效、环境音层、音乐提示和语音参数。

| 模块 | 目的 |
|--------|---------|
| **表现状态机** | 跟踪探索/对话/战斗/后续——驱动音频层的选择 |
| **Hook Lifecycle** | `enter-room`、`combat-start`、`combat-end`、`death`、`npc-speaking`——注入上下文感知的音频 |
| **Voice Caster** | 根据类型、性别和派别，自动将 NPC 映射到 [语音音板](https://github.com/mcp-tool-shop-org/original_voice-soundboard) 声音。 |
| **Audio Director** | 安排带有优先级、压低音量、冷却时间和防垃圾信息的提示。 |
| **Sound Registry** | 基于内容的音频条目——通过标签、情绪和强度进行查询。 |
| **MCP Bridge** | 将 AudioCommands 转换为语音音板工具调用。 |

## 三种模式

| 模式 | 作用 |
|------|-------------|
| **Play** | 沉浸式叙事的 RPG。Claude 进行叙述，NPC 根据他们的信念说话，行动通过游戏引擎来解决。 |
| **Director** | 检查隐藏的真相：`/inspect <npc>`、`/faction <id>`、`/trace <belief>`、`/divergences`、`/npc <name>`、`/people`、`/districts`、`/district <id>`、`/item <name>`、`/leverage`、`/moves`、`/jobs`、`/accepted` |
| **Replay** | 显示事件时间线，并同时展示客观真相和玩家的感知。 |

## 生态系统

Claude RPG 只是一个更大的工具链的一部分，用于构建基于模拟的游戏叙事：

| 项目 | 作用 |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | 确定性模拟运行时——完整的动态世界模块堆栈，没有使用任何 LLM 依赖。 |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | 2D 世界创作工作室——地图编辑器、NPC 构建器、渲染器、导出功能。 |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | 模式验证、故事板测试、AI RPG 导出流水线。 |
| **Claude RPG** (this repo) | 参考运行时——Claude 叙述、沉浸式音频、导演工具。 |

## 引擎包

Claude RPG 依赖于这些 [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 包：

| 包 | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | 状态、实体、行动、事件、规则、RNG。 |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 个模块——战斗、认知、感知、派系、谣言、NPC 代理、伙伴、影响力、战略地图、物品识别、突发机会。 |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | 角色发展、受伤、声望。 |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | 装备、物品来源、遗物成长、编年史。 |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | 跨会话记忆、关系影响。 |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | NarrationPlan 模式、渲染合同。 |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | 音频提示安排、优先级、压低音量。 |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | 声音包注册 + 核心包。 |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | 世界内容验证。 |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold 起始世界。 |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox 起始世界。 |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective 起始世界。 |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem 起始世界。 |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead 起始世界。 |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain 起始世界。 |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss 起始世界。 |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Iron Colosseum 起始世界。 |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Jade Veil 起始世界。 |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Crimson Court 起始世界。 |

## 运行时保证 (v1.6.0)

| 保证 | 执行 |
|-----------|------------|
| **引擎在叙述之前进行解析** | 具有 15 个确定性测试的轮次循环集成框架。 |
| **保存文件可以承受版本漂移** | 有序迁移流水线、历史固定装置测试、带有 .bak 恢复功能的原子写入。 |
| **Claude 的故障会变成对玩家友好的消息** | 带有 9 个错误路径测试的类型化 `NarrationError` 适配器，以及用于诊断的 `--debug` 标志。 |
| **流式传输不会破坏状态** | 在流式传输文本之前，规范状态已完成；6 个与流式传输相关的测试。 |
| **关键路径上的覆盖率下限** | CI 强制执行会话、叙述者、轮次循环和 LLM 适配器模块的阈值。 |

## 令牌预算

| 步骤 | 输入 | 输出 |
|------|-------|--------|
| 行动解释 | ~800 个令牌 | ~100 个令牌 |
| 场景叙述（NarrationPlan） | ~1400 个令牌 | ~300 个令牌 |
| NPC 对话 | ~1400 个令牌 | ~100 个令牌 |
| **Total per turn** | **~3600 个令牌** | **~500 个令牌** |

默认模型：`claude-sonnet-4-20250514`。世界生成使用 Opus 以获得更高的质量。

## 安全性

Claude RPG 是一款本地命令行界面 (CLI) 应用程序，它会向 Anthropic 发起外部 API 调用。

- **涉及的数据：** `~/.claude-rpg/saves/` 中的玩家存档文件、Anthropic API（仅限外部 HTTPS）
- **不涉及的数据：** 无遥测数据、无分析数据、无超出存档目录的文件系统访问
- **API 密钥：** 从 `ANTHROPIC_API_KEY` 环境变量中读取——绝不会存储、记录或传输到 Anthropic API 之外的地方
- **源代码中不包含任何敏感信息**——没有嵌入的令牌、凭据或 API 密钥

有关完整的安全策略和漏洞报告，请参阅 [SECURITY.md](SECURITY.md)。

## 许可证

MIT

---

由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建。
