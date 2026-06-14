# 宵祭(よいまつり) — 日本の夏祭り体験インタラクティブWebゲーム

夜の神社の参道を歩き、金魚すくいの屋台で遊べるブラウザゲーム。提灯・花火・祭囃子・群衆・虫の声で「夏祭りの夜」を体感させることが品質の中心。

## リポジトリ構成

```
260613_matsuri/
├── CLAUDE.md                    # このファイル
├── .claude/agents/              # 10体の専門サブエージェント定義
├── docs/                        # プロダクト文書(下記参照)
├── reports/                     # CURRENT_STATUS.md, reviews/, qa/, handoffs/
└── yoi-matsuri/    # アプリ本体(Vite + React 19 + TypeScript)
    ├── src/
    │   ├── core/    # GameLoop, SceneManager, InputManager, EventBus(所有: technical-architect)
    │   ├── game/    # 純TSドメインロジック(所有: gameplay-engineer)
    │   ├── scenes/  # approach/(environment-engineer), goldfish/(gameplay-engineer)
    │   ├── world/   # Three.js環境構築(所有: environment-engineer)
    │   ├── audio/   # Web Audioプロシージャル音響(所有: audio-director)
    │   └── ui/      # Reactコンポーネント(所有: gameplay-engineer)
    ├── tests/       # Vitest unit tests
    └── e2e/         # Playwright E2E tests
```

## コマンド(yoi-matsuri/ で実行)

```bash
npm run dev        # 開発サーバー
npm run typecheck  # 型チェック(エラー0が必須)
npm run lint       # ESLint(エラー0が必須)
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright E2E
npm run build      # 本番ビルド
```

## 現在のスコープ: Vertical Slice(厳守)

参道散策 → 金魚すくい屋台へ接近 → 店主と会話 → 金魚すくい(ポイ速度・水の抵抗・紙耐久が結果に影響) → 成否に応じた店主の反応と報酬 → 参道へ復帰。

**Vertical Slice完成まで、射的・型抜き・りんご飴・たこ焼き・お面屋などの追加屋台の実装は禁止。**

## 必読文書

| 文書 | 内容 | 所有者 |
|---|---|---|
| docs/PRODUCT_VISION.md | 体験目標と品質方針 | executive-producer |
| docs/GAME_DESIGN_DOCUMENT.md | メカニクス・バランス・会話(仕様の唯一の正) | game-director |
| docs/ART_DIRECTION.md | 色・光・造形の数値仕様 | art-director |
| docs/TECHNICAL_ARCHITECTURE.md | 技術構成・モジュール境界・性能予算 | technical-architect |
| docs/INTERACTION_SPEC.md | 入力・フィードバック・画面遷移 | interaction-designer |
| docs/AUDIO_SPEC.md | 音源・イベントマッピング | audio-director |
| docs/QUALITY_GATES.md | 完成の定義と計測方法 | qa-performance-engineer |
| docs/DECISION_LOG.md | 技術・デザイン決定の記録(追記のみ) | technical-architect |
| docs/AGENT_TASK_PROTOCOL.md | タスクカード形式・開発ループ規則 | executive-producer |
| docs/BACKLOG.md | 優先度付きタスク一覧 | executive-producer |

## 開発の鉄則

1. 1回の開発ループでは1つのユーザーストーリーだけを扱う。実装前にAcceptance Criteriaを定義する
2. 同じファイルを複数エージェントが同時に編集しない(所有者マップは上記とAGENT_TASK_PROTOCOL.md参照)
3. 実装者とReviewerを分離する。Reviewerはコードを直接修正しない
4. コードの統合(git commit)はLead Agentのみが行う。**リモートへのpushはユーザーの明示的許可なく禁止**
5. テスト失敗中に新機能へ進まない。TODO・ダミー表示・仮ボタン・未接続画面を完成扱いしない
6. 動作確認していない内容をCOMPLETEと報告しない(証跡必須)
7. 依存追加はtechnical-architectの評価とDECISION_LOG記録が必須
8. 既存のpackage.jsonとディレクトリ構成を不必要に作り直さない。小さなコミット単位で進める
9. 1タスク最大5ループ。各ループ終了時にKEEP/REVISE/REVERT/COMPLETE/BLOCKEDを判定。同一不具合の修正に3回失敗したら停止しreports/CURRENT_STATUS.mdへ記録
10. 各タスク完了後にgit diffとテスト結果を確認する

## 品質ゲート(出荷判定。詳細はdocs/QUALITY_GATES.md)

型エラー0 / ESLintエラー0 / test成功 / build成功 / 主要操作のE2E成功 / コンソール重大エラー0 / 通常プレイ50 FPS以上 / マウス・キーボード両対応 / 全操作にフィードバック / 視覚・音響の統一感 / Critical Reviewer承認
