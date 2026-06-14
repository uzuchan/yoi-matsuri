# TECHNICAL ARCHITECTURE — 宵祭(よいまつり)

所有者: technical-architect / 最終更新: 2026-06-13 / 版: 1.0

## 1. 技術スタック(確定。変更はDECISION_LOG経由)

| 層 | 技術 | 理由(DECISION_LOG参照) |
|---|---|---|
| ビルド | Vite 8 + TypeScript 6(strict) | 既存テンプレートを維持(D-001) |
| UI | React 19 | 既存。HUD/ダイアログ/結果画面のみに使用 |
| 3D描画 | three(react-three-fiber不使用) | D-002 |
| 音響 | Web Audio API(外部ライブラリ・音声アセット不使用) | D-004 |
| 状態管理 | 自前の軽量ステートマシン+EventBus(Redux等不使用) | D-006 |
| Unit test | Vitest | D-005 |
| E2E | Playwright(@playwright/test) | D-005 |

依存追加は technical-architect の評価とDECISION_LOG記録なしに行ってはならない。

## 2. ディレクトリ構成とモジュール境界

```
yoi-matsuri/src/
├── core/     # GameLoop, SceneManager, InputManager, EventBus, Dialogue(契約), rng
├── game/     # 純TSドメインロジック。three/react/DOMをimport禁止
│   ├── stall/     # 屋台横断の遊び契約(StallSession/StallStatus/StallEndReason/StallResult/StallSnapshot)= D-010
│   ├── goldfish/  # params.ts(全パラメータ), poi.ts, fish.ts, session.ts
│   ├── result/    # 結果解決(stallResult.ts=汎用 resolveStallResult/StallResultRules / reward.ts=金魚固有・委譲)
│   └── dialogue/  # DialogueController実装・会話データ・状態遷移(純TS)+ genericStall(汎用フォールバック会話)
├── scenes/   # SceneインターフェースのThree.js実装
│   ├── approach/  # 参道シーン(全屋台 placement への近接判定。stall:approach{stallId}/leave{stallId})
│   ├── dialogue/  # 会話シーン(背景はApproachScene参照を描画。stallId→controller を解決して駆動)
│   ├── stall/     # 屋台FW配線(StallDefinition/StallRegistry/MinigameScene/StallScene/computeResultCamera/definitions/)= D-010
│   ├── goldfish/  # 金魚すくいシーン(StallScene 実装。MinigameScene が stallId で委譲)
│   └── result/    # 結果シーン(registry の resultRules/placement で結果・カメラを解決)
├── world/    # 環境オブジェクト構築(提灯、鳥居、屋台、花火、群衆)
├── audio/    # AudioEngine + プロシージャル音源
└── ui/       # Reactコンポーネント(HudRoot=EventBus→React橋渡し+枠, Dialogue, StallHud=汎用屋台HUD, Result)
```

屋台フレームワーク(D-010): 参道の屋台は **StallDefinition(scenes/stall)+ StallRegistry** で「定義+登録」する。SceneId は屋台数に依存しない固定4種(approach/dialogue/minigame/result)で、`minigame` シーン(MinigameScene)が enter payload の `stallId` で該当 StallScene へ委譲する。合成点(App.tsx)が Registry を回して SceneManager 登録・近接・会話・結果を自動配線する。**新屋台は `scenes/stall/definitions/<id>.ts` に StallDefinition を1件書き、`definitions/index.ts` の `createStallRegistry()` に register を1行足すだけで遊べる**(純TS Session が `game/stall` の StallSession 契約を実装し、Scene が StallScene を実装する)。

合成点 App.tsx(D-008): `src/App.tsx` はゲームシェル兼「合成点」。全画面canvasにWebGLRendererをマウントし、GameLoop + SceneManager を起動し、その上に React HUD(`ui/HudRoot`)を重ねる。シーンの生成・登録と依存注入(DialogueScene への ApproachScene 参照・具象 DialogueController・遷移ハンドラの束縛、HudRoot への controller 引き渡し)を行う。**合成点は機能オーナー(各機能の実装エージェント)が具象注入のため最小編集してよい**(モジュール境界の例外。配線のみ)。

依存方向(逆流禁止):

```
ui ─────┐
scenes ─┼─→ core ←─ audio
world ──┘    ↑
game ────────┘   (gameはcoreの型のみ参照可。three/react import禁止)
```

- `game/` はDOM・three・react非依存の純TS。Vitestで完全にテスト可能に保つ
- シーン間・モジュール間の通信は `core/EventBus` のイベント経由(型付きイベントマップ)
- 音響は EventBus を購読するのみ。ゲームロジックがaudioを直接呼ばない

## 3. コアAPI(src/core 公開インターフェース)

```ts
// GameLoop: 固定タイムステップ(update 60Hz) + 可変描画(rAF)
interface GameLoop {
  start(): void; stop(): void;
  onUpdate(cb: (dt: number) => void): void;   // dt = 1/60 固定
  onRender(cb: (alpha: number) => void): void;
  readonly fps: number;                        // 直近1秒の実測FPS
}

// SceneManager: シーン状態機械(D-010: SceneId は屋台数に依存しない固定4種)
type SceneId = 'approach' | 'dialogue' | 'minigame' | 'result';  // 旧 'goldfish' → 'minigame' へ集約
interface Scene {
  readonly id: SceneId;
  enter(ctx: SceneContext): void; exit(): void;
  update(dt: number): void; render(alpha: number): void;
}
interface SceneManager {
  register(scene: Scene): void;
  transition(to: SceneId, payload?: unknown): void;  // 不正遷移はthrow。屋台は payload の stallId で識別
  readonly current: SceneId;
}
// ALLOWED_TRANSITIONS: approach→dialogue / dialogue→{approach,minigame} / minigame→result / result→approach

// EventBus: 型付きpub/sub
interface StallFinishedResult {                // 屋台プレイの最終成果(game/stall の StallResult と構造一致)
  readonly score: number;
  readonly reason: 'success' | 'timeout' | 'broke' | 'quit';
  readonly metrics?: Readonly<Record<string, number>>;
}
interface GameEvents {
  'scene:transition': { from: SceneId; to: SceneId };
  'stall:approach': { stallId: string };      // 近接圏に入った
  'stall:leave': { stallId: string };
  'dialogue:choice': { choiceId: string };
  'dialogue:view-changed': { view: DialogueView };  // 会話表示状態の更新(D-008)。DialogueScene→HudRoot
  'stall:finished': { stallId: string; result: StallFinishedResult };  // D-010: goldfish:* 3種を集約
  'sfx:play': { name: string };               // AUDIO_SPECのイベント表参照
  // 屋台固有の演出(捕獲カウンタ・破損音)は Scene 内 listener / sfx:play で処理し、型マップを膨らませない
  // 追加はこの型マップに追記(stringイベントの野放し禁止)
}

// InputManager の追跡キー(GameKey)に Enter を追加(D-008/T-004。セリフ送り・選択確定)

// 会話システムの契約(D-008。src/core/Dialogue.ts)。three/react/DOM 非依存。
// game/dialogue(段B)が DialogueController を実装、scenes/dialogue が駆動、ui/Dialogue が表示。
interface DialogueChoice { readonly id: string; readonly label: string }
interface DialogueView {                       // HUD描画に必要な表示状態スナップショット(プレーンデータ)
  readonly speaker: string;
  readonly text: string;                       // 現在セリフ全文
  readonly visibleText: string;                // 1文字送り(~30字/s)で今見えている部分
  readonly typing: boolean;                    // 送り中か
  readonly choices: readonly DialogueChoice[]; // 選択肢表示中のみ非空
  readonly focusedChoiceIndex: number;         // 選択肢のフォーカス(なければ -1)
  readonly active: boolean;                    // 会話進行中か
}
type DialogueOutcome =                          // advance/confirm/abort の結末。遷移先の解釈は DialogueScene
  | { readonly kind: 'continue' }
  | { readonly kind: 'choice'; readonly choiceId: string }
  | { readonly kind: 'aborted' };
interface DialogueController {                  // 入力2経路(キーボード=Scene / クリック=HUD)の集約先
  start(): void;
  tick(dt: number): void;                       // 毎フレーム。タイピング進行
  advance(): DialogueOutcome;                   // 送り/全文即時表示/次セリフ
  moveFocus(delta: number): void;               // ±1 フォーカス移動
  focus(index: number): void;                   // ホバーでフォーカス
  confirm(): DialogueOutcome;                   // 選択確定
  abort(): DialogueOutcome;                      // Esc 打ち切り(必ず aborted)
  view(): DialogueView;
}
```

### モジュールAPI: 会話システム(D-008 / T-004 段A)

- **`src/core/Dialogue.ts`**: 上記 `DialogueController` / `DialogueView` / `DialogueChoice` / `DialogueOutcome` を定義し core バレル(`src/core/index.ts`)から再エクスポート。段A(基盤)で確定。段Bは契約に従う(変更要は technical-architect へ依頼)。
- **`src/scenes/dialogue/DialogueScene.ts`**(Scene 実装): コンストラクタで ApproachScene 参照と既定 DialogueController を DI で受ける。`setControllerResolver(stallId→DialogueController)` を注入されると enter の payload `stallId` で会話を解決する(多屋台 / D-010)。`render(alpha)` は背景に ApproachScene.render を呼ぶ(プレイヤー非移動)。`update(dt)` は controller.tick とキーボード入力(立ち上がりエッジ)を controller へ渡し、表示状態変化を `dialogue:view-changed` で発火、結末で遷移する。choice の遷移先(minigame/approach)は合成点 App.routeChoice が単一オーナーで決め、`currentStallId` を読んで minigame へ stallId を引き継ぐ。遷移は `setTransitionHandler` 注入のハンドラ経由(Scene は SceneManager を直接参照しない)。アクティブ controller は `setActiveControllerListener` で合成点→HudRoot へ橋渡し(クリック経路の集約先)。
- **`src/ui/HudRoot.tsx`**: `{ events; controller; stallHud; resultHud; onResultReturn; inventory; inventoryFlyToken }` を受け、`dialogue:view-changed` を購読して会話オーバーレイ(`ui/Dialogue.tsx`)を、`stallHud`/`resultHud` で `ui/StallHud`(汎用屋台 HUD)/`ui/Result` をマウントする枠(3種は排他)。`DialogueProps`(`{ view; controller; events }`)も同ファイルで定義。
- **`src/App.tsx`**(合成点): StallRegistry を回して固定4シーン(approach/dialogue/minigame/result)を1つずつ登録し、近接・会話・結果・報酬を自動配線する(D-010)。`stall:finished` を購読して result へ遷移、result→approach で resultRules から報酬を所持品へ付与。

### モジュールAPI: 屋台フレームワーク(D-010 / StallFramework P0+P1)

- **`src/game/stall/`**(純TS契約): `StallSession<TInput,TState,TEvent>`(`update(dt,input)→TEvent[]` / `snapshot()→TState` / `status` / `result()→StallResult|null`)、`StallStatus`('playing'|'cleared'|'failed'|'timeout'|'quit')、`StallEndReason`('success'|'timeout'|'broke'|'quit')、`StallResult`(`{ score; reason; metrics? }`)、`StallSnapshot`(`{ status; timeRemaining; danger; score }` = 汎用 HUD の最小契約)、`StallCommonEvent`(`{ type:'stall-finished'; result }`)。
- **`src/game/result/stallResult.ts`**(純TS): `StallResultRules`(`thresholds`/`headings`/`shopkeeperLines`/`failByReason`/`rewardByTier`)、`resolveStallResult(result, rules)→StallOutcome`、`tierForScore`、`RewardInfo`。`reward.ts` は金魚固有 API を維持しつつ実体を委譲(`GOLDFISH_RESULT_RULES`)。
- **`src/scenes/stall/`**(配線・three/react を含むため core 外): `StallDefinition`(`{ id; displayName; placement; createScene(renderer)→StallScene; createDialogue?; resultRules }`)、`StallRegistry`(register/get/has/getAll。重複・未登録 throw)、`MinigameScene`(stallId で StallScene を遅延生成・委譲・exit で dispose)、`StallScene`(id='minigame' + setHudListener + dispose)、`StallHudState`/`StallPlacement`、`computeResultCamera(placement)`。屋台定義は `definitions/<id>.ts`、`definitions/index.ts` の `createStallRegistry()` で登録。
- **`src/ui/StallHud.tsx`**: 汎用屋台 HUD(残時間 + 0..1 ゲージ + スコア + 開始ヒント)。`StallHudState` を受ける。金魚の見た目・CSS クラス(.goldfish-hud*)を回帰0で共有。

## 4. 性能予算

| 項目 | 予算 | 計測方法 |
|---|---|---|
| FPS | 通常プレイ50以上(目標60) | GameLoop.fps を10秒間サンプリングした平均と下位10% |
| バンドル | gzip後 500 KB 以下 | npm run build の出力 |
| draw call | 100以下/フレーム | renderer.info.render.calls |
| 三角形 | 50k以下 | renderer.info.render.triangles |
| 動的ライト | 6灯以下 | ART_DIRECTION §4と連動 |

## 5. 品質ゲートのscripts(package.json)

```json
{
  "typecheck": "tsc -b",
  "lint": "eslint .",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "build": "tsc -b && vite build"
}
```

`strict: true` を tsconfig.app.json で有効化する(現状未設定 — T-001で対応)。

## 6. テスト戦略

- **Unit(Vitest, tests/)**: game/(物理・判定・AI・会話状態)とcore/(SceneManager遷移、GameLoop累積)を網羅。DOM不要のnode環境で実行
- **E2E(Playwright, e2e/)**: 主要動線(起動→移動→会話→金魚すくい→結果→復帰)+コンソールエラー検出。WebGLが必要なためChromiumで実行
- 描画見た目の自動テストはしない(art-directorの目視レビューで担保)

## 7. git運用

- mainブランチのみ(単独開発)。コミットはLead Agentの専権。1タスク=1〜3コミット
- リモートpushはユーザーの明示的許可が必要
- package-lock.json はnpmコマンドの結果のみコミット(手編集禁止)
