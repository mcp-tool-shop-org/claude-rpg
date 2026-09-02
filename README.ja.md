<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

# クロードRPG

シミュレーションに基づいたキャンペーンRPG。ストーリーはクロードが展開し、エンジンが真実を維持し、噂、圧力、派閥、関係性、経済、およびアークシステムを通じて世界が進化し、意味のある結末へと向かう。プレイすることも、それを拡張して独自のゲームを作成することもできる。


## クロードRPGとは？

クロードRPGは、[AI RPGエンジン](https://github.com/mcp-tool-shop-org/ai-rpg-engine)の上に構築されている。これは、戦闘、認知、知覚、派閥、噂、信念の起源、NPCの行動、仲間、プレイヤーの優位性、戦略マップ、アイテム認識、装備の起源、新たな機会、キャンペーンアークの検出、およびゲーム終盤のトリガーを網羅する29個のモジュールを備えた、決定論的なシミュレーション実行環境である。クロードの役割は、解釈し、物語を語り、セリフを言うことだ。エンジンの役割は、真実を保持することだ。

基本的なルール：**クロードが提案し、エンジンが決定する。**

プレイヤーは自由形式のテキストを入力する。クロードは意図を解釈し、エンジンはアクションを決定論的に解決し、知覚フィルターはプレイヤーが見たものを決定し、その後クロードはキャラクターが知覚したことだけを語る。没入型実行環境によって、音声、効果音、および周囲のオーディオが演出される。

NPCはスクリプトを暗唱しない。彼らは信念、記憶、派閥への忠誠心、そして噂に基づいて話す。彼らは理由があって嘘をつき、理由があって不確かな態度を取り、理由があって拒否する。ディレクターモードを使用すると、その理由を正確に確認できる。

## 独自のゲームを作成しよう

クロードRPGは単なるゲームではなく、AI RPGエンジンエコシステムのためのリファレンス実装である。これを出発点として、独自のシミュレーションに基づいたナラティブ体験を構築することができる。

| 次のようなことをしたいですか？ | 使用する： |
|------------|-----|
| **Play right now** | `npx @mcptoolshop/claude-rpg play`（インタラクティブな世界とキャラクターの選択） |
| **Create a new world** | `npx @mcptoolshop/claude-rpg new "your world concept"` |
| **Author worlds visually** | [ワールドフォージ](https://github.com/mcp-tool-shop-org/world-forge) — マップエディター、NPCビルダー、および検証機能を備えた2Dオーサリングスタジオ。 |
| **Validate world data** | [キャノンアーカイブ](https://github.com/mcp-tool-shop-org/cannon-archive) — スキーマ検証、ストーリーボードテスト、およびエクスポートパイプライン。 |
| **Build a custom runtime** | [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)パッケージを直接インポートする—クロードを任意のLLMに置き換えたり、独自のUIを追加したりできる。 |
| **Add new game modules** | エンジンをフォークし、解決パイプラインにモジュールを追加して登録する。 |

エンジンはLLMに依存しない。クロードRPGはAnthropicのモデルを使用しているが、コアエンジンにはLLMへの依存関係はないため、任意のモデルに接続したり、ナレーションなしで完全に決定論的に実行したりできる。

## インストール

```bash
npm install @mcptoolshop/claude-rpg
```

または、直接実行する：

```bash
npx @mcptoolshop/claude-rpg play
```

## クイックスタート

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

Anthropic APIキーを設定する（クロードによるナレーションにのみ必要）：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## v2.0.0の新機能

v2.0は、生き生きとした世界を体験できるリリースです。世界はゲームエンジン独自のサイクルで動き、街はプレイヤーの行動に反応し、過去に作成したすべてのセーブデータは引き続き読み込むことができます。

| 機能 | その意味 |
|---------|--------------|
| **世界は独自のサイクルで動く** | 生成された世界には、スターターパックと同等の完全なモジュールファミリーが含まれており、ゲームエンジン独自のサイクルが、状況、機会、遭遇、そして派閥の動きを制御します。また、すべてのセッションデータは、世界の真実を反映したものです。 |
| **Enemies act** | 敵は、攻撃を行う1ラウンド前に、その意図を明確に示します。また、ナレーションとは別に、戦闘チャンネルで、プレイヤーの結果、キル数、命中数、そして次の展開が表示されます。 |
| **Asks and recognition** | 助けを必要とする人々や、彼らに非常によく似た詐欺師が登場します。手がかりは事前に仕掛けられており、後になって、ある条件を満たすことで明らかになります。本当に困っている人を助けると、その場でそのことが伝えられます。傍観していると、噂が広まり、後になって感謝の気持ちが伝わり、名誉が与えられます。 |
| **The street answers you** | 不明なスラッシュコマンドは、ターンを消費することなく、すぐに処理されます。NPCに話しかけた後、そのNPCに文章を入力すると、それが会話として扱われます。名前だけを入力すると、その名前のNPCが話しかけてきます。また、出口の名前だけを入力すると、その出口に移動します。`/go <exit>`と`/rumors`は、プレイモードで機能します。引用符で囲まれた市場価格は、その場所のブロックに表示されます。 |
| **Rumors with a stance** | NPCは、噂を耳にし、それを信じるか疑うかによって反応します。噂は、隣接する地域に広がり、その広がり方は、事前に設定されたルールに従います。 |
| **A tuning surface** | すべての生き生きとした世界の要素は、事前に設定されたデフォルト値で動作し、`/tuning`を入力することで確認できます。また、すべての13の世界にわたって、決定論的な30ラウンドのサイクルが適用されます。敵のダメージは、そのルールに従って0.5に調整されています。 |
| **Save schema v3** | 噂を伝えるエンジンは、セーブデータを活用します。すべての1.xのセーブデータは、完全に忠実な状態で移行し、生成された世界は、中断した時点から再開されます。 |
| **5つのモデルファミリーによってプレイ** | 4つのAIファミリーによるプレイテスト（Mistral、Qwen、Llama、DeepSeek、Gemini、各40ターン）は、人間のテスターに代わり、最後の2つの段階を形作りました。 |
| **2,495回のテスト** | 121のファイルにわたる1,870回のテストから発展し、すべての段階は、多様なファミリーによる審査員と、決定論的な基準によって評価されました。 |

## 異なる点

| 何が違うのか？ | どのように違うのか？ |
|------|-----|
| **シミュレーションの真実とナレーションを分離** | エンジンは戦闘、移動、対話を解決し、クロードはその結果だけを語る。捏造された結果はない。 |
| **認知に基づいたNPCの対話** | NPCの発言のすべての行は、彼らの信念、記憶、士気、疑念、派閥、および噂に基づいて構築される。 |
| **知覚を考慮した表現** | クロードが受け取るのは、プレイヤーキャラクターが知覚したものだけである。不明瞭なエンティティは、名前の付いたターゲットとしてではなく、影のような姿として表示される。 |
| **オーディオ/ボイスによる没入型実行環境** | 構造化されたナレーションプランが、ボイスサウンドボードを通じて音声合成、効果音、周囲のレイヤー、および音楽を制御する。 |
| **隠された真実に対するディレクターの可視性** | `/inspect pilgrim`は信念を表示する。`/trace`は起源を表示する。`/divergences`は、実際に何が起こったのかと、あなたが思ったことがどうだったかを表示する。 |
| **結果チェーンを持つNPCの行動力** | NPCは目標に基づいて行動し、義務を追跡し、忠誠心の閾値が変わると報復する。`/npc`と`/people`は、閾値、影響を与える可能性のある要素、およびアクティブな結果チェーンを表示する。 |
| **Living districts** | 地区には、プレイヤーの行動、派閥の動き、NPCの因果関係によって変化する商業、士気、安全があります。ムードはナレーションに流れ込み、ゲームプレイを調整します。`/districts`と`/district`が地域の状況を調べます。 |
| **離脱のリスクがある仲間たち** | パーティーメンバーには、士気、忠誠心、離脱のトリガーがあります。彼らを限界まで追い詰めると、エンジンが追跡する理由で去ります。 |
| **プレイヤーの交渉力と政治的行動** | 影響力、好意、情報を社会的、噂、外交、妨害などの行動に費やします。`/leverage`はあなたの政治的資本を示します。 |
| **装備の来歴と遺物** | アイテムには歴史が刻まれています。十分な敵を倒した剣は、エピタフを持つ遺物になります。NPCは装備されたアイテムを認識し、反応します。`/item`が来歴と年代記を調べます。 |
| **Emergent opportunities** | 契約、賞金、好意、補給ミッション、調査は、世界の状況（圧力、不足、NPCの目標、義務）から発生します。受け入れるか、拒否するか、放棄するか、裏切るかを選択できます。`/jobs`と`/accepted`が利用可能でアクティブなタスクを追跡します。 |
| **キャンペーンのアークとエンディング** | エンジンは、蓄積された状態から10種類の物語アーク（勢力拡大、狩られる側、王の操り人形、抵抗など）と8つのエンディング解決クラス（勝利、追放、打倒、殉教など）を検出します。`/arcs`が軌跡を示し、`/conclude`がオプションのLLMナレーションによる構造化されたエピローグをレンダリングします。 |

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

## 没入型ランタイム（v0.2）

ナレーターは生の文章を出力するのではなく、テキスト、効果音、環境レイヤー、音楽キュー、音声パラメーターを記述した構造化されたレシピである「ナレーションプラン」を生成します。

| モジュール | 目的 |
|--------|---------|
| **プレゼンテーション状態機械** | 探索/対話/戦闘/余波を追跡し、オーディオレイヤーの選択を制御します。 |
| **Hook Lifecycle** | `enter-room`、`combat-start`、`combat-end`、`death`、`npc-speaking` — コンテキストを認識したオーディオを注入します。 |
| **Voice Caster** | NPCをタイプ、性別、派閥によって[ボイスサウンドボード](https://github.com/mcp-tool-shop-org/original_voice-soundboard)の音声に自動的にマッピングします。 |
| **Audio Director** | 優先度、音量調整、クールダウン、アンチスパムを使用してキューをスケジュールします。 |
| **Sound Registry** | コンテンツアドレス指定可能なオーディオエントリ — タグ、ムード、強度でクエリを実行します。 |
| **MCP Bridge** | AudioCommandsをボイスサウンドボードのツール呼び出しに変換します。 |

## 3つのモード

| モード | その機能 |
|------|-------------|
| **Play** | 没入感のあるナレーションRPG。クロードがナレーションを行い、NPCは信念に基づいて話し、行動はエンジンを通じて解決されます。 |
| **Director** | 隠された真実を調べます：`/inspect <npc>`、`/faction <id>`、`/trace <belief>`、`/divergences`、`/npc <name>`、`/people`、`/districts`、`/district <id>`、`/item <name>`、`/leverage`、`/moves`、`/jobs`、`/accepted` |
| **Replay** | 客観的な真実とプレイヤーの認識を並べて表示するイベントタイムラインを表示します。 |

## エコシステム

Claude RPGは、シミュレーションに基づいたナラティブゲームを構築するためのより大規模なツールチェーンの一部です。

| プロジェクト | その機能 |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | 決定論的なシミュレーション実行時間 — 完全な生き生きとした世界のモジュールスタック、LLMへの依存なし |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | 2Dワールド作成スタジオ — マップエディター、NPCビルダー、レンダラー、エクスポート |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | スキーマ検証、ストーリーボードテスト、AI RPGのエクスポートパイプライン |
| **Claude RPG** (this repo) | リファレンスランタイム — クロードナレーション、没入型オーディオ、ディレクターツール |

## エンジンパッケージ

Claude RPGは、これらの[@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)パッケージに依存しています。

| パッケージ | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | 状態、エンティティ、アクション、イベント、ルール、RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29のモジュール — 戦闘、認知、知覚、派閥、噂、NPCの主体性、仲間、交渉力、戦略マップ、アイテム認識、偶発的な機会 |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | キャラクターの成長、負傷、評判 |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | 装備、アイテムの来歴、遺物の成長、年代記 |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | クロスセッションメモリ、関係性の影響 |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | ナレーションプランスキーマ、レンダリング契約 |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | オーディオキューのスケジュール、優先度、音量調整 |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | サウンドパックレジストリ + コアパック |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | ワールドコンテンツの検証 |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | チャペル・スレッショルドスターターワールド |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | ネオンロックボックススターターワールド |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | ガスライト・ディテクティブスターターワールド |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | ブラックフラッグレクイエムスターターワールド |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | アッシュフォールデッドスターターワールド |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | ダストデビルズバーゲンスターターワールド |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | シグナルロススターターワールド |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | アイアンコロシアムスターターワールド |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | ジェイドベールスターターワールド |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | クリムゾンコートスターターワールド |

## ランタイム保証（v1.6.0）

| 保証 | 実施 |
|-----------|------------|
| **エンジンはナレーションの前に解決します** | 15の決定論的テストを備えたターンループ統合ハーネス |
| **セーブファイルはバージョン移行後も残ります** | 順序付けられた移行パイプライン、履歴フィクスチャテスト、.bak回復によるアトミック書き込み |
| **クロードの失敗はプレイヤーにとって安全なメッセージになります** | 9つのエラーパステストと診断用の`--debug`フラグを備えた型付き`NarrationError`アダプター |
| **ストリーミングによって状態が破損することはありません** | カノニカルな状態は、ストリームされたテキストが重要になる前に最終決定されます。6つのストリーミング固有のテストがあります。 |
| **重要なパスでのカバレッジの下限** | CIは、セッション、ナレーター、ターンループ、LLMアダプターごとにモジュールごとのしきい値を強制します。 |

## トークン予算

| ステップ | 入力 | 出力 |
|------|-------|--------|
| アクションの解釈 | 〜800トークン | 〜100トークン |
| シーンナレーション（ナレーションプラン） | 〜1400トークン | 〜300トークン |
| NPCの対話 | 〜1400トークン | 〜100トークン |
| **Total per turn** | **〜3600トークン** | **〜500トークン** |

デフォルトモデル：`claude-sonnet-4-20250514`。ワールド生成には、品質のためにOpusを使用します。

## セキュリティ

Claude RPGは、Anthropicに対して外部API呼び出しを行うローカルのCLIアプリケーションです。

- **アクセスされるデータ:** `~/.claude-rpg/saves/`内のプレイヤーのセーブファイル、Anthropic API（送信のみHTTPS）
- **アクセスされないデータ:** テレメトリー、分析、セーブディレクトリ外のファイルシステムは一切使用しません
- **APIキー:** `ANTHROPIC_API_KEY`環境変数から読み取ります。APIキーは保存、記録、またはAnthropic API以外への送信は行いません
- **ソースコードに機密情報は含まれません:** 埋め込まれたトークン、認証情報、またはAPIキーはありません

完全なセキュリティポリシーと脆弱性報告については、[SECURITY.md](SECURITY.md)を参照してください。

## ライセンス

MIT

---

[MCP Tool Shop](https://mcp-tool-shop.github.io/)によって作成されました
