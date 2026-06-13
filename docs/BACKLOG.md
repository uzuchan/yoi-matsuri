# BACKLOG — 宵祭(よいまつり)

所有者: executive-producer / 最終更新: 2026-06-13

## Vertical Slice 実装順(この順で1タスクずつ。テスト失敗中は次へ進まない)

| 優先 | Task ID | 内容 | Owner | Reviewer | VS要件 | Status |
|---|---|---|---|---|---|---|
| P0 | T-001 | 技術基盤(scripts/strict/テスト基盤/ゲームシェル) | technical-architect | critical-reviewer | 全部の前提 | COMPLETE |
| P0 | T-002 | 夜の参道環境(提灯・鳥居・屋台・群衆・フォグ) | environment-engineer | art-director + critical-reviewer | 1, 9(視覚) | COMPLETE |
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
Status：COMPLETE(2026-06-13、ループ1で完了。レビュー: reports/reviews/REV-T-001-1.md = APPROVE)
```

### T-001で追加する依存(technical-architect評価済み・DECISION_LOG記録済み)

| 依存 | 種別 | 根拠 |
|---|---|---|
| three, @types/three | dependencies / devDependencies | D-002 |
| vitest | devDependencies | D-005 |
| @playwright/test | devDependencies | D-005 |

これ以外の依存追加はこのタスクでは禁止。

---

## T-002 詳細タスクカード(2番目の実装タスク)

```
Task ID：T-002
Owner：environment-engineer
Reviewer：art-director(視覚) + critical-reviewer(総合)
Goal：固定カメラが見下ろす夜の神社参道の「世界」を構築する。提灯列・鳥居・金魚すくい屋台(外観)・群衆シルエット・夜のライティングで、ART_DIRECTIONの寒色の夜×暖色の灯りの対比を成立させる
User Story：プレイヤーとして、画面を開いた瞬間に「夏祭りの夜の参道」だと分かる風景を見たい。なぜなら、ここを歩き屋台を見つけるという体験全体の土台になるから(VS要件1の視覚面・9の視覚面)
Inputs：docs/ART_DIRECTION.md(§2パレット全色, §3造形寸法, §4ライティング/フォグ, §5カメラ, §6性能予算, §7レビュー基準), docs/GAME_DESIGN_DOCUMENT.md(§2参道の寸法=幅8m奥行60m・提灯間隔・屋台位置・鳥居位置), docs/TECHNICAL_ARCHITECTURE.md(§2モジュール境界=world/, §4性能予算), reports/CURRENT_STATUS.md(§0のT-001引き継ぎ事項)
Editable Files：
  - natsumatsuri-interactive/src/world/(新規。提灯・鳥居・屋台・群衆・ライティング・接地のビルダーモジュール群)
  - natsumatsuri-interactive/src/scenes/approach/ApproachScene.ts(world/のオブジェクトを組み込む。T-001の地面emissive暫定値の見直しを含む)
  - natsumatsuri-interactive/tests/world/(新規。配置計算等の純TSロジックのunit test)
Forbidden Changes：
  - src/core/, src/game/, src/ui/, src/audio/, src/scenes/goldfish/(他エージェント所有)
  - src/App.tsx(ゲームシェル。dispose()のライフサイクル配線が必要ならLeadの統合作業に委ねる。ApproachScene側にdispose()を実装するに留める)
  - 依存追加(threeのみ使用可。新規npm依存はtechnical-architect承認が必要)
  - docs/**, .claude/**, package.json, 設定ファイル, git commit/push
  - スコープ外: プレイヤー移動・追従カメラ・近接判定(T-003)、花火アニメ・群衆/提灯以外の動的演出の作り込み(T-009)、金魚すくいの遊技水槽(T-006)、音響(T-008)
Acceptance Criteria：
  AC1. src/world/ に責務分割されたビルダーが存在する(例: lanterns.ts, torii.ts, stall.ts, crowd.ts, lighting.ts, ground.ts)。各ビルダーはThree.jsのObject3Dを返し、ApproachScene がそれらを組み立てる
  AC2. 提灯列: 参道両脇に2.5m間隔・各側24個、高さ2.6mのワイヤーに吊る。形状は楕円体(径0.35m・高さ0.45m)+上下の円筒枠、紙は emissive #ff9d45・赤帯 #c0392b。提灯本体はInstancedMeshで描画する。各提灯はわずかに揺れる(±2°、周期3〜5sのランダム位相。update(dt)で駆動)
  AC3. 鳥居: 参道終端(z≈-60)に高さ8m、色 #b03a2e。シルエット重視で可
  AC4. 金魚すくい屋台: 参道中腹の右側に配置。間口3m×奥行2m、紅白幕(#c0392b/#f5f0e8)、カウンター、屋根、裸電球2個(#ffd166 発光)、水槽(楕円・水面 #1e4d6b opacity0.85)、店主の人型シルエット+前掛け。※屋台は外観のみ(遊技機能なし)
  AC5. 群衆シルエット: 参道脇に15〜20体、人型(高さ1.5〜1.8m)、色 #0d1126 無発光。InstancedMeshで描画(個体ごとの揺れ歩行はT-009のため静的配置でよい)
  AC6. ライティング(ART §4厳守): 動的PointLightは提灯代表4灯(#ff9d45, intensity1.2, distance6, decay2)+屋台1灯(#ffd166, intensity1.5, distance8)の計5灯以内、合計6灯を超えない。影マップは使わない。接地感は暗色の接地円で表現する。屋台前がシーン中で最も明るい場所になっている。T-001の地面emissive暫定値(0.9)は光源導入を踏まえ見直す(撤去または減衰)
  AC7. パレット遵守: 画面に現れる色がART §2のパレット内に収まっている(中間色光源を置かない)
  AC8. 性能: renderer.info.render.triangles がシーン全体で50,000以下、動的PointLightが6灯以下。build+previewで ?debug=1 のFPSが50以上(計測条件を報告に明記)
  AC9. リソース管理: ApproachScene.dispose() を実装し、生成した全geometry/material/InstancedMeshのGPUリソースを解放する。複数回呼んでも安全(idempotent)。これを検証するunit testがある(M-2対応)。フレーム毎の新規アロケーションを行わない
  AC10. 品質ゲートG1全通過(typecheck/lint/test/build エラー0)。TODO/ダミー残置なし。新規依存なし。スクリーンショットを reports/screenshots/T-002-approach.png に保存
Tests：tests/world/ に配置計算の決定論的unit test(提灯24個×2側の座標、群衆体数が15〜20、屋台/鳥居の配置座標がGDD通り)、dispose()のidempotentテスト。乱数を使う場合はindexベースの決定論的ジッタにする(再現可能・テスト可能であること。core/rngへの依存は作らない)。コマンド: npm run typecheck && npm run lint && npm run test && npm run build、目視はbuild+preview
Evidence：4コマンドの実行ログ、triangles実測値とdebug FPS実測値、reports/screenshots/T-002-approach.png、ART §2パレットとの色対応表(使用色→用途→ART該当行)
Risks：
  (1) PointLight 5灯+多数のemissiveメッシュで暗く沈む/明るすぎる → exposureはApp.tsxで固定(触らない)。emissiveIntensityとPointLight distanceで調整し報告に最終値を記載
  (2) 提灯/群衆をInstancedMeshにすると個体の揺れ実装が複雑 → 揺れはinstanceMatrixの毎フレーム更新で実装。重い場合は揺れ対象を可視範囲に限定し報告
  (3) 三角形数が予算超過 → セグメント数を落とす(球の分割等)。50k超なら報告しart-directorと相談
Status：COMPLETE(2026-06-13、ループ2で完了。レビュー: critical-reviewer=APPROVE / art-director=無条件合格。reports/reviews/REV-T-002-1.md)
```
