<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
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

シミュレーション基盤のターミナルRPG。Claudeがナレーションを担当し、エンジンが真実を管理し、没入ランタイムがボイス・サウンド・演出を制御します。

## Claude RPGとは？

Claude RPGは[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)の上に構築されています。AI RPG Engineは、戦闘、認知、知覚、派閥、噂、信念の出所、NPCの自律行動、仲間、プレイヤーの影響力、戦略マップ、アイテム認識、装備の来歴、突発的な機会、キャンペーンアーク検出、エンドゲームトリガーをカバーする29のモジュールを持つ決定論的シミュレーションランタイムです。Claudeの役割は解釈し、語り、声を当てること。エンジンの役割は真実を管理することです。

黄金律: **Claudeが提案し、エンジンが裁定する。**

プレイヤーは自由にテキストを入力します。Claudeが意図を解釈し、エンジンがアクションを決定論的に解決し、知覚フィルタがプレイヤーが実際に何を見たかを判定し、その後Claudeはキャラクターが知覚した内容のみをナレーションします — ボイス、効果音、環境音は没入ランタイムが演出します。

NPCは台本を読み上げません。信念、記憶、派閥への忠誠、噂に基づいて話します。理由があって嘘をつきます。理由があって不確かになります。理由があって拒否します。ディレクターモードでその理由を正確に確認できます。

## インストール

```bash
npm install claude-rpg
```

または直接実行:

```bash
npx claude-rpg play --world fantasy
```

## クイックスタート

```bash
# 組み込みのChapel Thresholdシナリオをプレイ
npx claude-rpg play --world fantasy

# プロンプトから新しいワールドを生成
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

Anthropic APIキーを設定:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 何が違うのか

| 特徴 | 仕組み |
|------|--------|
| **シミュレーションの真実とナレーションの分離** | エンジンが戦闘、移動、会話を解決し、Claudeはその結果のみをナレーションします。捏造された結果はありません。 |
| **認知に基づくNPC対話** | NPCの台詞はすべて、信念、記憶、士気、疑念、派閥、噂から構築されます。 |
| **知覚を考慮した表現** | Claudeはプレイヤーキャラクターが知覚した情報のみを受け取ります。視認性の低いエンティティは名前付きターゲットではなく、影のような人影として表示されます。 |
| **オーディオ/ボイス没入ランタイム** | 構造化されたナレーションプランがvoice-soundboardを通じてボイス合成、効果音、環境音レイヤー、音楽を制御します。 |
| **隠された真実へのディレクター視点** | `/inspect pilgrim`で信念を表示。`/trace`で出所を表示。`/divergences`で、あなたが起きたと思ったことと実際に起きたことの差異を表示。 |
| **連鎖する結果を伴うNPCの自律行動** | NPCは目標に基づいて行動し、義務を追跡し、忠誠のブレイクポイントが変化すると報復します。`/npc`と`/people`でブレイクポイント、影響力の切り口、アクティブな結果連鎖を確認できます。 |
| **生きた地区** | 地区には商業、士気、安全性があり、プレイヤーの行動、派閥の動き、NPCの結果連鎖によって変動します。雰囲気がナレーションに反映され、ゲームプレイをスケールさせます。`/districts`と`/district`で地区の状況を確認できます。 |
| **離脱リスクのある仲間** | パーティメンバーには士気、忠誠度、離脱トリガーがあります。限界を超えるとエンジンが追跡する理由に基づいて離脱します。 |
| **プレイヤーの影響力と政治的行動** | 影響力、恩義、情報を使って社会的行動、噂の流布、外交、妨害工作を実行できます。`/leverage`で政治的資本を確認できます。 |
| **装備の来歴とレリック** | アイテムには歴史があります。十分な敵を倒した剣は称号付きのレリックになります。NPCは装備中のアイテムを認識し反応します。`/item`で来歴と年代記を確認できます。 |
| **突発的な機会** | 契約、賞金首、依頼、補給任務、調査が世界の状況 — 圧力、希少性、NPCの目標、義務 — から発生します。受諾、辞退、放棄、裏切りが可能です。`/jobs`と`/accepted`で利用可能な仕事とアクティブな仕事を追跡できます。 |
| **キャンペーンアークとエンドゲーム** | エンジンは蓄積された状態から10種類のナラティブアーク（rising-power、hunted、kingmaker、resistanceなど）と8種類のエンドゲーム解決クラス（victory、exile、overthrow、martyrdomなど）を検出します。`/arcs`で軌跡を確認。`/conclude`でオプションのLLMナレーション付き構造化エピローグを描画します。 |

## アーキテクチャ

```
プレイヤーが自由にテキストを入力
    |
[1] アクション解釈 (Claude)
    入力: プレイヤーテキスト + 動詞 + エンティティ + 出口
    出力: { verb, targetIds, confidence }
    |
[2] エンジン解決 (決定論的)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] 知覚フィルタリング (決定論的)
    presentForObserver() -> プレイヤーが見たもの
    |
[4] フック: ナレーション前
    ゾーン環境音、戦闘アラート、死亡エフェクト
    |
[5] ナレーションプラン (Claude)
    入力: フィルタ済みシーン + プレゼンテーション状態
    出力: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] オーディオディレクター
    優先度、ダッキング、クールダウン -> AudioCommand[]
    |
[7] プレゼンテーション
    voice-soundboardによるボイス合成 + 効果音 + 環境音
    ターミナルへのテキストレンダリング
    |
[8] NPC対話 (Claude、発話時)
    認知に基づく: 信念、記憶、派閥、噂
    NPC毎にボイスキャスト
```

## 没入ランタイム (v0.2)

ナレーターは生のテキストを出力するのではなく、**NarrationPlan**を生成します。これはテキスト、効果音、環境音レイヤー、音楽キュー、ボイスパラメータを記述する構造化されたレシピです。

| モジュール | 目的 |
|-----------|------|
| **プレゼンテーション状態マシン** | 探索 / 対話 / 戦闘 / 事後処理を追跡 — オーディオレイヤー選択を制御 |
| **フックライフサイクル** | `enter-room`、`combat-start`、`combat-end`、`death`、`npc-speaking` — コンテキストに応じたオーディオを注入 |
| **ボイスキャスター** | NPCをタイプ、性別、派閥に基づいて[voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard)のボイスに自動マッピング |
| **オーディオディレクター** | 優先度、ダッキング、クールダウン、連続防止でキューをスケジューリング |
| **サウンドレジストリ** | コンテンツアドレス可能なオーディオエントリ — タグ、ムード、強度でクエリ |
| **MCPブリッジ** | AudioCommandをvoice-soundboardのツールコールに変換 |

## 3つのモード

| モード | 機能 |
|--------|------|
| **Play** | 没入型ナレーションRPG。Claudeがナレーションし、NPCは信念に基づいて話し、アクションはエンジンを通じて解決されます。 |
| **Director** | 隠された真実を確認: `/inspect <npc>`、`/faction <id>`、`/trace <belief>`、`/divergences`、`/npc <name>`、`/people`、`/districts`、`/district <id>`、`/item <name>`、`/leverage`、`/moves`、`/jobs`、`/accepted` |
| **Replay** | イベントタイムラインを客観的真実とプレイヤーの知覚を並べて表示します。 |

## エンジンパッケージ

Claude RPGは以下の[@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)パッケージに依存しています:

| パッケージ | 目的 |
|-----------|------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | 状態、エンティティ、アクション、イベント、ルール、乱数生成 |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29モジュール — 戦闘、認知、知覚、派閥、噂、NPCの自律行動、仲間、影響力、戦略マップ、アイテム認識、突発的な機会 |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | キャラクター成長、負傷、名声 |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | 装備、アイテムの来歴、レリック成長、年代記 |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | セッション間メモリ、関係性の影響 |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | NarrationPlanスキーマ、レンダリング契約 |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | オーディオキュースケジューリング、優先度、ダッキング |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | サウンドパックレジストリ + コアパック |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | ワールドコンテンツバリデーション |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Thresholdスターターワールド |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockboxスターターワールド |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detectiveスターターワールド |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiemスターターワールド |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Deadスターターワールド |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargainスターターワールド |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Lossスターターワールド |

## トークン予算

| ステップ | 入力 | 出力 |
|---------|------|------|
| アクション解釈 | 約800トークン | 約100トークン |
| シーンナレーション (NarrationPlan) | 約1400トークン | 約300トークン |
| NPC対話 | 約1400トークン | 約100トークン |
| **1ターンあたりの合計** | **約3600トークン** | **約500トークン** |

デフォルトモデル: `claude-sonnet-4-20250514`。ワールド生成にはOpusを使用し、品質を確保します。

## セキュリティ

Claude RPGはAnthropicへの送信APIコールを行うローカルCLIアプリケーションです。

- **アクセスするデータ:** `~/.claude-rpg/saves/`内のプレイヤーセーブファイル、Anthropic API（送信HTTPSのみ）
- **アクセスしないデータ:** テレメトリなし、アナリティクスなし、セーブディレクトリ外のファイルシステムへのアクセスなし
- **APIキー:** `ANTHROPIC_API_KEY`環境変数から読み取り — Anthropic API以外への保存、記録、送信は一切なし
- **ソースコード内に秘密情報なし** — 埋め込みトークン、認証情報、APIキーなし

完全なセキュリティポリシーと脆弱性報告については[SECURITY.md](SECURITY.md)を参照してください。

## ライセンス

MIT

---

[MCP Tool Shop](https://mcp-tool-shop.github.io/)が開発
