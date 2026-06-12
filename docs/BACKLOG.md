# BACKLOG — 宵祭(よいまつり)

所有者: executive-producer / 最終更新: 2026-06-13

## Vertical Slice 実装順(この順で1タスクずつ。テスト失敗中は次へ進まない)

| 優先 | Task ID | 内容 | Owner | Reviewer | VS要件 | Status |
|---|---|---|---|---|---|---|
| P0 | T-001 | 技術基盤(scripts/strict/テスト基盤/ゲームシェル) | technical-architect | critical-reviewer | 全部の前提 | READY |
| P0 | T-002 | 夜の参道環境(提灯・鳥居・屋台・群衆・フォグ) | environment-engineer | art-director + critical-reviewer | 1, 9(視覚) | PENDING |
| P0 | T-003 | プレイヤー移動・追従カメラ・屋台近接判定とプロンプト | environment-engineer | critical-reviewer | 1, 2 | PENDING |
| P0 | T-004 | 会話システム(ダイアログUI・店主会話・選択肢・遷移) | gameplay-engineer | critical-reviewer | 3 | PENDING |
| P0 | T-005 | 金魚すくいコアロジック(ポイ物理・水抵抗・紙耐久・金魚AI・判定。unit test必須) | gameplay-engineer | critical-reviewer | 4, 5, 6 | PENDING |
| P0 | T-006 | 金魚すくいシーン描画と統合(水槽・ポイ・金魚・HUD) | gameplay-engineer | art-director + critical-reviewer | 4, 5, 6 | PENDING |
| P0 | T-007 | 結果画面・店主の反応・報酬・参道へ復帰 | gameplay-engineer | game-director + critical-reviewer | 7, 8 | PENDING |
| P1 | T-008 | 音響一式(環境音レイヤー+効果音+AudioEngine) | audio-director | critical-reviewer | 9(音響) | PENDING |
| P1 | T-009 | 雰囲気仕上げ(花火・群衆の揺れ・歩行ボブ・演出磨き) | environment-engineer | art-director + critical-reviewer | 9 | PENDING |
| P1 | T-010 | E2E主要動線・FPS計測・品質ゲート総点検 | qa-performance-engineer | critical-reviewer | 出荷判定 | PENDING |
| P1 | T-011 | 出荷判定(G3体験品質レビュー: art/game/audio director+critical-reviewer並列) | critical-reviewer | Lead Agent | 出荷判定 | PENDING |

注:
- T-002〜T-009の各タスクカードは、直前タスクのCOMPLETE後にexecutive-producerが詳細化する(インターフェースが確定してから書く)
- T-005とT-006を分けるのは、物理ロジック(unit test対象)と描画統合を別レビューにするため。Ownerは同一なのでファイル競合なし
- 音響(T-008)は各操作イベントが出揃った後に一括実装する。それまでのタスクはEventBusへのイベント発火だけを実装しておく(AUDIO_SPECのイベント表が契約)

## Icebox(Vertical Slice完成まで起票禁止)

射的 / 型抜き / りんご飴 / たこ焼き / お面屋 / モバイル対応 / セーブ / 多言語化 / ランキング

---

## T-001 詳細タスクカード(最初の実装タスク)

```
Task ID：T-001
Owner：technical-architect
Reviewer：critical-reviewer
Goal：品質ゲートを満たす開発基盤と、ゲームの実行シェル(固定タイムステップのゲームループ+シーン状態機械+入力+夜空の描画土台)を確立する
User Story：開発チームとして、型・Lint・テスト・ビルドが常に検証できる土台と、全シーンが乗る実行シェルが欲しい。なぜなら以降の全ストーリーがこの上に積まれるから
Inputs：docs/TECHNICAL_ARCHITECTURE.md(全節), docs/QUALITY_GATES.md(G1, G2-2), docs/ART_DIRECTION.md(§2 夜空/フォグ色のみ), docs/DECISION_LOG.md(D-001〜D-007)
Editable Files：natsumatsuri-interactive/{package.json, tsconfig.app.json, tsconfig.node.json, vite.config.ts, vitest.config.ts(新規), playwright.config.ts(新規), eslint.config.js, index.html, src/**, tests/**(新規), e2e/**(新規), public/**}
Forbidden Changes：docs/**, .claude/**, reports/**, package-lock.jsonの手編集, git commit/push, Vertical Slice範囲外の機能
Acceptance Criteria：
  AC1. tsconfig.app.json で strict: true が有効で、npm run typecheck がエラー0で成功する
  AC2. npm run lint がエラー0で成功する(eslint.config.js に「src/game/はthree/react importを禁止」のルールが入っている)
  AC3. npm run test が成功し、以下を検証するunit testが計8件以上ある:
       - SceneManager: register/遷移/不正遷移(approach→result等)がthrow/currentの更新/scene:transitionイベント発火
       - GameLoop: 固定タイムステップの累積呼び出し回数、スパイク時の上限クランプ、fps算出
       - EventBus: 型付きon/off/emit、購読解除後に呼ばれない
  AC4. npm run build が成功し、gzip後の総バンドルサイズが500KB以下である
  AC5. npm run dev で全画面canvasにthreeのシーン(夜空グラデーション#0a0e2e→#1a2348、FogExp2 #141a38、地面プレーン#3a3148)が描画され、ウィンドウリサイズに追従する
  AC6. InputManagerがキーボード(WASD/矢印/E/Space/Esc)とマウス(移動/押下/解放)の状態を公開し、unit testがある
  AC7. URLに ?debug=1 を付けるとFPSと描画統計のオーバーレイが表示される(通常時は非表示)
  AC8. e2e/smoke.spec.ts: ページ起動→canvas表示→3秒間でconsole error/pageerrorが0件、が成功する
  AC9. Reactテンプレートの残骸(App.css, デモ用index.cssスタイル, assets/react.svg, vite.svg, hero.png, カウンターUI)が削除されている
Tests：tests/core/scene-manager.test.ts, tests/core/game-loop.test.ts, tests/core/event-bus.test.ts, tests/core/input-manager.test.ts, e2e/smoke.spec.ts。コマンド: npm run typecheck && npm run lint && npm run test && npm run build, npm run test:e2e
Evidence：4コマンドの実行ログ、test:e2eの結果、バンドルサイズの出力、(可能なら)描画画面のスクリーンショット
Risks：(1) Playwrightブラウザのダウンロード失敗 → AC8のみBLOCKEDとして報告しLead判断。(2) three追加でバンドル増 → ツリーシェイク確認、500KB超なら報告。(3) strict化で既存テンプレートコードにエラー → 残骸削除で同時解消
Status：READY
```

### T-001で追加する依存(technical-architect評価済み・DECISION_LOG記録済み)

| 依存 | 種別 | 根拠 |
|---|---|---|
| three, @types/three | dependencies / devDependencies | D-002 |
| vitest | devDependencies | D-005 |
| @playwright/test | devDependencies | D-005 |

これ以外の依存追加はこのタスクでは禁止。
