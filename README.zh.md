<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
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

基于模拟驱动的终端 RPG 游戏——Claude 负责叙事，引擎守护真相，沉浸式运行时编排语音、音效与呈现。

## 什么是 Claude RPG？

Claude RPG 建立在 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 之上——一个确定性模拟运行时，包含 29 个模块，覆盖战斗、认知、感知、阵营、谣言、信念溯源、NPC 自主行为、同伴、玩家影响力、战略地图、物品识别、装备溯源、突发机遇、战役弧线检测以及终局触发。Claude 的职责是解读、叙述和配音。引擎的职责是掌控真相。

核心准则：**Claude 提议，引擎裁决。**

玩家输入自由文本。Claude 解读意图，引擎确定性地解析行动，感知过滤器决定玩家实际看到了什么，随后 Claude 仅叙述角色所感知到的内容——同时由沉浸式运行时编排语音、音效和环境音。

NPC 不会照本宣科。他们基于信念、记忆、阵营忠诚和谣言来说话。他们有理由地说谎。他们有理由地犹豫。他们有理由地拒绝。导演模式可以让你精确查看其中的原因。

## 安装

```bash
npm install claude-rpg
```

或直接运行：

```bash
npx claude-rpg play --world fantasy
```

## 快速开始

```bash
# 游玩内置的 Chapel Threshold 场景
npx claude-rpg play --world fantasy

# 通过提示词生成新世界
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

设置 Anthropic API 密钥：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 为什么与众不同

| 特性 | 实现方式 |
|------|----------|
| **模拟真相与叙事分离** | 引擎解析战斗、移动、对话——Claude 仅叙述结果。不会产生虚构的结局。 |
| **NPC 对话基于认知模型** | 每句 NPC 对话都建立在其信念、记忆、士气、猜疑、阵营和谣言之上。 |
| **感知感知驱动的呈现** | Claude 仅接收玩家角色所感知到的信息。低清晰度实体显示为模糊身影，而非带名字的目标。 |
| **音频/语音沉浸式运行时** | 结构化叙事方案驱动语音合成、音效、环境音层和音乐——通过 voice-soundboard 实现。 |
| **导演模式可查看隐藏真相** | `/inspect pilgrim` 查看信念。`/trace` 查看溯源。`/divergences` 查看你认为发生的与实际发生的之间的差异。 |
| **NPC 自主行为与连锁后果** | NPC 基于目标行动，追踪义务，在忠诚度临界点偏移时进行报复。`/npc` 和 `/people` 展示临界点、影响力角度和活跃的后果链。 |
| **活化街区** | 街区拥有商业、士气和治安属性，随玩家行动、阵营动态和 NPC 后果链而变化。氛围会流入叙事并影响游戏节奏。`/districts` 和 `/district` 可查看街区脉动。 |
| **同伴存在离队风险** | 队伍成员拥有士气、忠诚度和离队触发条件。逼迫过甚他们就会离开——原因由引擎追踪。 |
| **玩家影响力与政治行动** | 消耗影响力、人情和情报来执行社交、散播谣言、外交和破坏行动。`/leverage` 查看你的政治资本。 |
| **装备溯源与遗物** | 物品承载历史。一把杀敌足够多的剑会成为拥有称号的遗物。NPC 会识别装备的物品并作出反应。`/item` 可查看溯源和编年史。 |
| **突发机遇** | 合约、悬赏、人情、补给任务和调查任务从世界状态中涌现——基于压力、匮乏、NPC 目标和义务。接受、拒绝、放弃或背叛。`/jobs` 和 `/accepted` 追踪可用和进行中的任务。 |
| **战役弧线与终局** | 引擎从累积状态中检测 10 种叙事弧线类型（崛起、被追猎、造王者、抵抗等）和 8 种终局解决方案（胜利、流放、推翻、殉道等）。`/arcs` 展示轨迹。`/conclude` 渲染结构化尾声，可选 LLM 叙述。 |

## 架构

```
玩家输入自由文本
    |
[1] 行动解读（Claude）
    输入：玩家文本 + 动词 + 实体 + 出口
    输出：{ verb, targetIds, confidence }
    |
[2] 引擎解析（确定性）
    engine.submitAction() -> ResolvedEvent[]
    |
[3] 感知过滤（确定性）
    presentForObserver() -> 玩家所见
    |
[4] 钩子：叙事前
    区域环境音、战斗警报、死亡效果
    |
[5] 叙事方案（Claude）
    输入：过滤后的场景 + 呈现状态
    输出：NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] 音频导演
    优先级、压混、冷却 -> AudioCommand[]
    |
[7] 呈现层
    语音合成 + 音效 + 环境音（通过 voice-soundboard）
    文本渲染至终端
    |
[8] NPC 对话（Claude，在对话时）
    基于认知模型：信念、记忆、阵营、谣言
    每个 NPC 分配独立语音
```

## 沉浸式运行时（v0.2）

叙述者不会输出原始散文——它生成一个 **NarrationPlan**：一个结构化配方，描述文本、音效、环境音层、音乐提示和语音参数。

| 模块 | 用途 |
|------|------|
| **呈现状态机** | 追踪探索 / 对话 / 战斗 / 战后阶段——驱动音频层选择 |
| **钩子生命周期** | `enter-room`、`combat-start`、`combat-end`、`death`、`npc-speaking`——注入上下文感知音频 |
| **语音选角器** | 根据类型、性别、阵营自动将 NPC 映射到 [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) 语音 |
| **音频导演** | 调度提示信号，处理优先级、压混、冷却、防刷屏 |
| **音效注册表** | 内容寻址的音频条目——按标签、情绪、强度查询 |
| **MCP 桥接** | 将 AudioCommand 转换为 voice-soundboard 工具调用 |

## 三种模式

| 模式 | 功能说明 |
|------|----------|
| **游玩模式** | 沉浸式叙事 RPG。Claude 叙述，NPC 基于信念说话，行动通过引擎解析。 |
| **导演模式** | 检视隐藏真相：`/inspect <npc>`、`/faction <id>`、`/trace <belief>`、`/divergences`、`/npc <name>`、`/people`、`/districts`、`/district <id>`、`/item <name>`、`/leverage`、`/moves`、`/jobs`、`/accepted` |
| **回放模式** | 逐步浏览事件时间线，并排展示客观真相与玩家感知。 |

## 引擎包

Claude RPG 依赖以下 [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 包：

| 包名 | 用途 |
|------|------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | 状态、实体、行动、事件、规则、随机数生成 |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 个模块——战斗、认知、感知、阵营、谣言、NPC 自主行为、同伴、影响力、战略地图、物品识别、突发机遇 |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | 角色成长、伤病、声望 |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | 装备、物品溯源、遗物成长、编年史 |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | 跨会话记忆、关系影响 |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | NarrationPlan 模式、渲染契约 |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | 音频提示调度、优先级、压混 |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | 音效包注册表 + 核心音效包 |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | 世界内容验证 |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold 起始世界 |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox 起始世界 |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective 起始世界 |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem 起始世界 |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead 起始世界 |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain 起始世界 |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss 起始世界 |

## Token 预算

| 步骤 | 输入 | 输出 |
|------|------|------|
| 行动解读 | ~800 tokens | ~100 tokens |
| 场景叙事（NarrationPlan） | ~1400 tokens | ~300 tokens |
| NPC 对话 | ~1400 tokens | ~100 tokens |
| **每回合总计** | **~3600 tokens** | **~500 tokens** |

默认模型：`claude-sonnet-4-20250514`。世界生成使用 Opus 以确保质量。

## 安全性

Claude RPG 是一个本地 CLI 应用程序，仅向 Anthropic 发起出站 API 调用。

- **涉及的数据：** `~/.claude-rpg/saves/` 中的玩家存档文件，Anthropic API（仅出站 HTTPS）
- **不涉及的数据：** 无遥测、无分析、不访问存档目录之外的文件系统
- **API 密钥：** 从 `ANTHROPIC_API_KEY` 环境变量读取——不存储、不记录、不传输至 Anthropic API 之外的任何地方
- **源码中无密钥** ——无嵌入的令牌、凭证或 API 密钥

完整安全策略和漏洞报告详见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT

---

由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建
