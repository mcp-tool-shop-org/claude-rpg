<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Claude RPGは、Claudeが物語を演出し、エンジンが真実を維持し、噂、圧力、派閥、関係性、経済、そしてアーキタイプシステムを通じて世界が進化していく、シミュレーションに基づいたキャンペーン形式のRPGです。プレイすることも、開発に貢献することもできます。

## Claude RPGとは？

Claude RPGは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)という、戦闘、認知、知覚、派閥、噂、信念の根拠、NPCの行動、仲間、プレイヤーの行動力、戦略マップ、アイテム認識、装備の根拠、予期せぬ機会、キャンペーンの展開、そしてゲーム終盤のトリガーなど、29のモジュールを網羅した、決定論的なシミュレーション実行環境の上に構築されています。Claudeの役割は、解釈、語り、そして発言することです。エンジンの役割は、真実を維持することです。

黄金のルール：**Claudeが提案し、エンジンが実行する。**

プレイヤーは自由にテキストを入力します。Claudeは意図を解釈し、エンジンは決定論的にアクションを実行し、知覚フィルターがプレイヤーが実際に見たものを決定し、そしてClaudeはキャラクターが認識したことのみを語ります。その際には、ボイス、効果音、そして没入感を高めるための環境音などが使用されます。

NPCはスクリプトを読み上げることはありません。彼らは信念、記憶、派閥への忠誠心、そして噂に基づいて発言します。彼らは理由があって嘘をつきます。彼らは理由があって確信を持てないのです。彼らは理由があって拒否します。ディレクターモードでは、その理由を詳しく調べることができます。

## あなた自身のものを作り上げよう

Claude RPGは、単なるゲームではありません。AI RPG Engineのエコシステムのための参考実装です。あなた自身のシミュレーションに基づいた物語体験のための出発点として活用してください。

| 以下のようなことをしたい場合： | 使用する |
|------------|-----|
| **Play right now** | `npx claude-rpg play --world fantasy` |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — マップエディター、NPC作成ツール、そして検証機能を持つ2D制作環境 |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — スキーマ検証、ストーリーボードテスト、そしてパイプラインのエクスポート機能 |
| **Build a custom runtime** | [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)のパッケージを直接インポートする — Claudeを他のLLMに置き換えたり、独自のUIを追加したりできます。 |
| **Add new game modules** | エンジンをフォークして、解決パイプラインにモジュールを追加し、登録することができます。 |

このエンジンは、特定のLLMに依存していません。Claude RPGはAnthropicのモデルを使用していますが、コアエンジンはLLMに依存していません。そのため、他のモデルに接続したり、ナレーションなしで完全に決定論的に動作させたりすることも可能です。

## インストール

```bash
npm install claude-rpg
```

または、直接実行する：

```bash
npx claude-rpg play --world fantasy
```

## クイックスタート

```bash
# Play the built-in Chapel Threshold scenario
npx claude-rpg play --world fantasy

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

AnthropicのAPIキーを設定します（Claudeによるナレーションに必要な場合のみ）：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## それが他のものと違う理由

| 何が | どのように |
|------|-----|
| **シミュレーションの真実とナレーションの分離** | エンジンは戦闘、移動、会話を処理し、Claudeは結果のみを語ります。想像上の結果は表示されません。 |
| **認知に基づいたNPCの会話** | NPCの発言はすべて、彼らの信念、記憶、士気、疑念、派閥、そして噂に基づいて構築されています。 |
| **知覚を考慮した表現** | Claudeは、プレイヤーキャラクターが認識した情報のみを受け取ります。不明瞭な存在は、名前のついたターゲットではなく、影のような姿として表示されます。 |
| **没入感の高いオーディオ/ボイスランタイム** | 構造化されたナレーションプランが、ボイス合成、効果音、環境音、そして音楽を、ボイス・サウンドボードを通じて制御します。 |
| **隠された真実を可視化するディレクター機能** | `/inspect pilgrim`は信念を表示します。`/trace`は根拠を表示します。`/divergences`は、あなたが考えたことと実際に起こったことの違いを表示します。 |
| **NPCの行動と結果の連鎖** | NPCは目標に基づいて行動し、義務を追跡し、忠誠心が低下すると報復します。`/npc`と`/people`は、重要なポイント、利用可能な要素、そして現在進行中の結果の連鎖を表示します。 |
| **Living districts** | 地区には、プレイヤーの行動、派閥の動き、NPCの行動の結果によって変化する、商業、士気、安全といった要素があります。感情が物語に反映され、ゲームプレイに影響を与えます。`/districts` および `/district` コマンドで、地域の状況を確認できます。 |
| **離脱のリスクがある仲間** | パーティーメンバーには、士気、忠誠心、そして離脱のトリガーが存在します。彼らを過度に追い詰めると、理由をシステムが記録し、彼らは去ってしまいます。 |
| **プレイヤーの行動力と政治的行動** | 影響力、好意、情報などを消費して、社交、噂、外交、そして妨害などの行動を実行します。`/leverage` コマンドで、あなたの政治的な影響力を確認できます。 |
| **装備の由来と遺物** | アイテムには、その歴史が刻まれています。十分な敵を倒した剣は、ある称号を持つ遺物へと変わります。NPCは装備されているアイテムを認識し、それに応じて反応します。`/item` コマンドで、アイテムの由来や記録を確認できます。 |
| **Emergent opportunities** | 契約、賞金、好意、物資調達、そして調査は、世界の状況（プレッシャー、資源の不足、NPCの目標、義務など）から発生します。それを受け入れる、拒否する、放棄する、あるいは裏切ることができます。`/jobs` および `/accepted` コマンドで、利用可能な仕事と実行中の仕事を確認できます。 |
| **キャンペーンの展開とエンディング** | システムは、蓄積された状況から、10種類の物語の展開（勢力拡大、追跡、王権掌握、抵抗など）と、8種類のエンディング（勝利、追放、打倒、殉教など）を検出します。`/arcs` コマンドで、物語の展開を確認できます。`/conclude` コマンドで、構造化されたエピローグを生成し、オプションでLLMによるナレーションを追加できます。 |

## アーキテクチャ

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

ナレーターは、生の文章を出力するのではなく、**NarrationPlan（ナレーション計画）** を生成します。これは、テキスト、効果音、環境音、音楽、そして音声パラメータを記述した構造化されたレシピです。

| モジュール | 目的 |
|--------|---------|
| **プレゼンテーションの状態マシン** | 探索/会話/戦闘/結果を追跡し、オーディオレイヤーの選択を制御します。 |
| **Hook Lifecycle** | `enter-room`（部屋への進入）、`combat-start`（戦闘開始）、`combat-end`（戦闘終了）、`death`（死亡）、`npc-speaking`（NPCの会話）など、コンテキストに応じたオーディオを挿入します。 |
| **Voice Caster** | NPCを、タイプ、性別、派閥に基づいて、[voice-soundboard（音声サウンドボード）](https://github.com/mcp-tool-shop-org/original_voice-soundboard) の音声に自動的に割り当てます。 |
| **Audio Director** | 優先度、ミュート、クールダウン、スパム対策などを設定して、オーディオをスケジュールします。 |
| **Sound Registry** | タグ、感情、強度などで検索できる、コンテンツ指向のオーディオエントリー。 |
| **MCP Bridge** | AudioCommands（オーディオコマンド）を、voice-soundboardツールの呼び出しに変換します。 |

## 3つのモード

| モード | 機能 |
|------|-------------|
| **Play** | 没入感のあるナレーションRPG。Claudeがナレーションを行い、NPCは自身の信念に基づいて発言し、行動はシステムによって解決されます。 |
| **Director** | 隠された真実を調査：`/inspect <npc>`、`/faction <id>`、`/trace <belief>`、`/divergences`、`/npc <name>`、`/people`、`/districts`、`/district <id>`、`/item <name>`、`/leverage`、`/moves`、`/jobs`、`/accepted` |
| **Replay** | イベントのタイムラインを歩き、客観的な真実とプレイヤーの認識を並べて表示します。 |

## エコシステム

Claude RPGは、シミュレーションに基づいた物語ゲームを構築するための、より大きなツールチェーンの一部です。

| プロジェクト | 機能 |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | 決定論的なシミュレーション実行環境。29のモジュール、LLMへの依存はありません。 |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | 2Dの世界構築スタジオ。マップエディター、NPC作成ツール、レンダラー、エクスポート機能。 |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | スキーマ検証、ストーリーボードテスト、AI RPGのエクスポートパイプライン。 |
| **Claude RPG** (this repo) | リファレンス実行環境。Claudeによるナレーション、没入感のあるオーディオ、ディレクターツール。 |

## エンジンパッケージ

Claude RPGは、これらの[@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)パッケージに依存しています。

| パッケージ | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | 状態、エンティティ、アクション、イベント、ルール、乱数生成。 |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29のモジュール：戦闘、認知、知覚、派閥、噂、NPCの自律性、仲間、影響力、戦略マップ、アイテム認識、予期せぬ機会。 |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | キャラクターの成長、負傷、評判 |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | 装備、アイテムの由来、遺物の成長、記録 |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | セッション間の記憶、関係性の効果 |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | ナレーションプランのスキーマ、レンダリング契約 |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | オーディオキューのスケジュール、優先度、ミュート |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | サウンドパック登録 + コアパック |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | ワールドコンテンツの検証 |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold スタートワールド |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox スタートワールド |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective スタートワールド |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem スタートワールド |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead スタートワールド |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain スタートワールド |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss スタートワールド |

## トークン予算

| ステップ | 入力 | 出力 |
|------|-------|--------|
| アクションの解釈 | 約800トークン | 約100トークン |
| シーンナレーション（ナレーションプラン） | 約1400トークン | 約300トークン |
| NPCの会話 | 約1400トークン | 約100トークン |
| **Total per turn** | **約3600トークン** | **約500トークン** |

デフォルトモデル: `claude-sonnet-4-20250514`. ワールド生成には、品質向上のためにOpusを使用します。

## セキュリティ

Claude RPGは、AnthropicのAPIを外部から呼び出すローカルCLIアプリケーションです。

- **アクセスするデータ:** プレイヤーのセーブファイル（`~/.claude-rpg/saves/`）、Anthropic API（HTTPSのみ、外部からのアクセス）
- **アクセスしないデータ:** テレメトリー、分析、セーブディレクトリ以外のファイルシステム
- **APIキー:** 環境変数`ANTHROPIC_API_KEY`から読み込みます。保存、ログ、Anthropic API以外への送信は行われません。
- **ソースコードに機密情報なし:** 埋め込まれたトークン、認証情報、APIキーは含まれていません。

詳細なセキュリティポリシーおよび脆弱性報告については、[SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

MIT

---

[MCP Tool Shop](https://mcp-tool-shop.github.io/) によって作成されました。
