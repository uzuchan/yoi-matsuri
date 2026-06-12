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
natsumatsuri-interactive/src/
├── core/     # GameLoop, SceneManager, InputManager, EventBus, rng
├── game/     # 純TSドメインロジック。three/react/DOMをimport禁止
│   └── goldfish/  # params.ts(全パラメータ), poi.ts, fish.ts, session.ts
├── scenes/   # SceneインターフェースのThree.js実装
│   ├── approach/  # 参道シーン
│   └── goldfish/  # 金魚すくいシーン
├── world/    # 環境オブジェクト構築(提灯、鳥居、屋台、花火、群衆)
├── audio/    # AudioEngine + プロシージャル音源
└── ui/       # Reactコンポーネント(HUD, Dialogue, Result)
```

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

// SceneManager: シーン状態機械
type SceneId = 'approach' | 'dialogue' | 'goldfish' | 'result';
interface Scene {
  readonly id: SceneId;
  enter(ctx: SceneContext): void; exit(): void;
  update(dt: number): void; render(alpha: number): void;
}
interface SceneManager {
  register(scene: Scene): void;
  transition(to: SceneId, payload?: unknown): void;  // 不正遷移はthrow
  readonly current: SceneId;
}

// EventBus: 型付きpub/sub
interface GameEvents {
  'scene:transition': { from: SceneId; to: SceneId };
  'stall:approach': { stallId: string };      // 近接圏に入った
  'stall:leave': { stallId: string };
  'dialogue:choice': { choiceId: string };
  'goldfish:caught': { total: number };
  'goldfish:poi-torn': Record<string, never>;
  'goldfish:finished': { caught: number; reason: 'torn' | 'timeout' | 'quit' };
  'sfx:play': { name: string };               // AUDIO_SPECのイベント表参照
  // 追加はこの型マップに追記(stringイベントの野放し禁止)
}
```

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
