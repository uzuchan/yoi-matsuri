# BACKLOG — 宵祭(よいまつり)

所有者: executive-producer / 最終更新: 2026-06-13

## Vertical Slice 実装順(この順で1タスクずつ。テスト失敗中は次へ進まない)

| 優先 | Task ID | 内容 | Owner | Reviewer | VS要件 | Status |
|---|---|---|---|---|---|---|
| P0 | T-001 | 技術基盤(scripts/strict/テスト基盤/ゲームシェル) | technical-architect | critical-reviewer | 全部の前提 | COMPLETE |
| P0 | T-002 | 夜の参道環境(提灯・鳥居・屋台・群衆・フォグ) | environment-engineer | art-director + critical-reviewer | 1, 9(視覚) | COMPLETE |
| P0 | T-003 | プレイヤー移動・追従カメラ・屋台近接判定とプロンプト | environment-engineer | critical-reviewer | 1, 2 | COMPLETE |
| P0 | T-004 | 会話システム(ダイアログUI・店主会話・選択肢・遷移) | gameplay-engineer(+technical-architectが基盤) | critical-reviewer + interaction-designer | 3 | COMPLETE |
| P0 | T-005 | 金魚すくいコアロジック(ポイ物理・水抵抗・紙耐久・金魚AI・判定。unit test必須) | gameplay-engineer | critical-reviewer + game-director | 4, 5, 6 | COMPLETE |
| P0 | T-006 | 金魚すくいシーン描画と統合(水槽・ポイ・金魚・HUD) | gameplay-engineer | art-director + critical-reviewer | 4, 5, 6 | COMPLETE |
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

---

## T-003 詳細タスクカード(3番目の実装タスク)

```
Task ID：T-003
Owner：environment-engineer
Reviewer：critical-reviewer(+ プレイヤー造形についてart-directorの視覚所見)
Goal：プレイヤーが夜の参道を歩いて金魚すくい屋台へ近づけるようにする。三人称追従カメラ、キーボード/マウス両対応の移動、屋台への近接判定と「E: 屋台をのぞく」プロンプト表示までを実装する
User Story：プレイヤーとして、参道を自分で歩いて屋台に近づきたい。なぜなら「屋台を見つけて立ち寄る」という体験の入口だから(VS要件1・2)
Inputs：docs/INTERACTION_SPEC.md(§1原則, §3.1 approachの入力表とマウスのみ操作の保証, §4 プロンプト文言), docs/GAME_DESIGN_DOCUMENT.md(§2 参道=幅8m奥行60m・walkSpeed 3.0m/s・interactRadius 3.0m), docs/ART_DIRECTION.md(§5カメラ approach: 後方5m/高さ3.2m/俯角15°/追従lag0.15s/FOV55°, §2 UIテキスト色 #f5f0e8), docs/TECHNICAL_ARCHITECTURE.md(§3 SceneContext=enter(ctx)でctx.input/ctx.eventsが使える, GameEventsのstall:approach/stall:leave), reports/CURRENT_STATUS.md(§0-2 T-002引き継ぎ: STALL_POSITION={x:5,z:-26}, world座標系)
Editable Files：
  - natsumatsuri-interactive/src/scenes/approach/ApproachScene.ts(プレイヤー・追従カメラ・移動・近接判定・プロンプトの統合。enter(ctx)でctx.input/ctx.eventsを使う)
  - natsumatsuri-interactive/src/world/(新規: player.ts プレイヤー造形, movement.ts 移動/クランプの純TSロジック, proximity.ts 近接enter/leave判定, promptLabel.ts ワールド空間プロンプトラベル など。既存ファイルへの追記も可)
  - natsumatsuri-interactive/tests/world/(移動・クランプ・近接判定のunit test)
  - reports/screenshots/T-003-approach.png
Forbidden Changes：
  - src/core/(EventBus/SceneManager等。GameEventsへのイベント追加が必要になったら実装せず報告。T-003は既存のstall:approach/stall:leaveのみ使う)
  - src/ui/(React HUDはgameplay-engineerの所有。プロンプトはapproachシーン内のワールド空間ラベル=Sprite等で実装し、src/ui/には作らない)
  - src/game/, src/audio/, src/scenes/goldfish/, src/App.tsx, docs/**, .claude/**, package.json, 設定ファイル, git commit/push
  - 新規依存追加(threeのみ)
  - スコープ外: E押下→会話への遷移と会話画面(T-004の所有)。金魚すくい(T-005/006)。音響(T-008)。花火・歩行アニメ(T-009)
Acceptance Criteria：
  AC1. プレイヤーの最小限の可視表現(パレット整合の単純な人型。ART未規定のためart-director所見を仰ぐ)がApproachSceneに存在し、追従カメラがART §5どおり(プレイヤー後方5m・高さ3.2m・俯角15°・追従lag0.15s・FOV55°)に追従する
  AC2. キーボード移動: W/↑前進・S/↓後退・A/←・D/→で移動、walkSpeed 3.0m/s。dtベースでフレームレート非依存。プレイヤーは歩行可能範囲(参道 幅8m=x∈[-4,4]、z は入口付近〜鳥居(z=-60)手前)にクランプされ、範囲外・鳥居の先へ出られない
  AC3. マウスのみで屋台へ到達できる(INTERACTION_SPEC §3.1): 左ボタン押下中は前進し、進行方向が屋台方向へ緩やかに収束する。これによりキーボードを使わずに屋台の近接圏へ入れる
  AC4. マウス移動で視線がわずかに追従する(±5°程度。過剰な回転をしない)
  AC5. 近接判定: プレイヤーがSTALL_POSITIONからinteractRadius 3.0m以内に入った瞬間に 'stall:approach' {stallId} を1回だけ発火、離れた瞬間に 'stall:leave' {stallId} を1回だけ発火する(滞在中・圏外滞在中に連続発火しない)。stallIdは定数化する
  AC6. プロンプト「E: 屋台をのぞく」(INTERACTION_SPEC §4の文言そのまま)を、近接圏内で表示・圏外で非表示にする(0.2sフェード)。ワールド空間ラベル(Sprite等、テキストはcanvasテクスチャで生成)としてapproachシーン内に実装。色はUIテキスト #f5f0e8。src/ui/は使わない
  AC7. 移動積分・クランプ・近接enter/leaveエッジ判定が純TS関数として分離され、unit testがある(dt積分の正しさ、境界クランプ、近接の単発発火=同一状態での重複発火がないこと)
  AC8. E押下→会話遷移は意図的にT-004へ繰り延べる。T-003ではE押下に遷移を割り当てない(ダミーの会話画面・未接続画面を作らない)。この繰り延べをコードコメントと報告に明記する
  AC9. 性能維持: build+preview(実GPU)で ?debug=1 のFPSが50以上、trianglesが予算50k以内(プレイヤー追加は軽微)。update内でのフレーム毎アロケーションを行わない
  AC10. 品質ゲートG1全通過(typecheck/lint/test/build エラー0)。TODO/ダミー残置なし。新規依存なし。reports/screenshots/T-003-approach.png に「プレイヤーが屋台近くでプロンプト表示中」の画を保存
Tests：tests/world/ に movement(dt積分・クランプ)、proximity(enter/leaveの単発発火・境界値)のunit test。コマンド: npm run typecheck && npm run lint && npm run test && npm run build、目視はbuild+preview
Evidence：4コマンドの実行ログ、FPS実測値と計測コマンド(GPU有効フラグ含む)、reports/screenshots/T-003-approach.png、近接イベント発火の確認方法と結果
Risks：
  (1) マウスのみ前進の「屋台方向へ収束」が強すぎてキーボード移動と干渉 → 収束はマウス押下時のみ適用し報告に係数を記載
  (2) 追従カメラのlagでカメラ酔い/遅延過大 → lag0.15sを厳守、実機で確認
  (3) プロンプトのワールド空間ラベルがフォグで沈む/常に正面を向かない → Spriteは常時カメラ向き、fog:falseで視認性確保。最終設定を報告
  (4) プレイヤー造形がART未規定 → 最小・パレット整合で実装し、art-directorの所見を仰ぐ(必要ならART §にプレイヤー項を追記する別タスク化)
Status：COMPLETE(2026-06-13、ループ2で完了。ループ1で実装・自己検証→R3F混入ブロッカーで中断→系統B退避・系統A復元→ループ2でプレイヤー視認性をart-director指摘どおり修正。レビュー: critical-reviewer=APPROVE / art-director=条件付き合格の指摘を解消。reports/reviews/REV-T-003-1.md。unit test 82件・実GPU FPS120)
```

---

## T-004 詳細タスクカード(4番目の実装タスク — 2段構成)

VS要件3「店主との短い会話を開始できる」。React HUD層と会話の3D統合という設計判断を伴うため、(A)technical-architectが基盤+アーキ決定、(B)gameplay-engineerが会話内容・UI・配線、の順で行う。

### アーキテクチャ方針(D-008としてtechnical-architectが確定・記録する)
- `dialogue` は SceneManager のシーンとして扱う(既存のALLOWED_TRANSITIONS approach→dialogue→{approach,goldfish} を活かす)
- DialogueSceneは独自の3D世界を作らず、**注入されたApproachSceneの参照で背景に参道world(屋台・店主)を描画**する(屋台が会話中も見える)。プレイヤー移動は止める
- 会話ボックス・選択肢は**React HUDオーバーレイ**(src/ui/)で表示し、EventBus経由で駆動する
- 会話内容・状態遷移ロジックは three/react 非依存の純TS(src/game/dialogue/)。DialogueControllerインターフェースは core に置き(game→core / scenes→core / ui→core の依存方向を守る)、game/dialogueが実装、DialogueSceneとHudRootが利用する(DI)
- 入力: キーボード送り/選択はDialogueSceneがInputManagerを読む、クリックはReactオーバーレイが処理し、どちらもDialogueControllerへ集約

```
Task ID：T-004
Owner：gameplay-engineer(実装本体) / 基盤: technical-architect
Reviewer：critical-reviewer(総合) + interaction-designer(UX所見)
Goal：屋台の近接圏でEまたはクリックすると店主との会話が始まり、セリフ送り・選択肢(「遊んでいく」「またあとで」)で進行できる。会話中も屋台が背景に見える。選択に応じてgoldfish(遊ぶ)または approach(断る)へ遷移する
User Story：プレイヤーとして、屋台の店主に話しかけて短い会話をしたい。なぜなら「屋台に立ち寄る」体験の核であり、金魚すくいへ入る導線だから(VS要件3)
Inputs：docs/GAME_DESIGN_DOCUMENT.md(§3.1 初回会話の全セリフと選択肢=実装する文言の正), docs/INTERACTION_SPEC.md(§2状態遷移, §3.2 dialogue入力表=クリック/Enter/Space送り・↑↓/ホバー選択・Esc打ち切り・1文字送り30字/s, §4文言), docs/ART_DIRECTION.md(§2 UIテキスト#f5f0e8/アクセント#ff9d45・80%透過パネル), docs/TECHNICAL_ARCHITECTURE.md(§3 GameEvents/SceneManager), docs/AUDIO_SPEC.md(§4 dialogue-next/select/confirm のイベント名=発火のみ。音実装はT-008), reports/CURRENT_STATUS.md(§0-3 T-003引き継ぎ: 近接中E/クリックで transition('dialogue',{stallId:'goldfish-stall'}))

【段A: technical-architect 基盤】
Editable Files(段A)：
  - natsumatsuri-interactive/src/core/(DialogueController/DialogueView インターフェースと会話関連の型。GameEventsに会話表示用イベントが必要なら追加=ここで承認・実装)
  - natsumatsuri-interactive/src/scenes/dialogue/DialogueScene.ts(新規。背景にApproachScene参照を描画、InputManager読み取り、DialogueController駆動、HUDへ表示イベント発火、Esc/選択で遷移)
  - natsumatsuri-interactive/src/ui/HudRoot.tsx(新規。EventBus→React state ブリッジ。会話オーバーレイのマウント枠)
  - natsumatsuri-interactive/src/App.tsx(HudRootマウント、DialogueScene登録=ApproachScene参照と具象Controllerを注入する合成点)
  - docs/DECISION_LOG.md(D-008追記), docs/TECHNICAL_ARCHITECTURE.md(§2/§3にHudRoot・scenes/dialogue・DialogueController契約・合成点としてのApp.tsxを追記)
Forbidden Changes(段A)：src/game/, src/world/, src/scenes/approach(参照公開に最小変更が要る場合のみ、render再利用のための公開メソッド追加に限定し報告), src/audio/, _parallel-r3f/。新規依存追加(threeとReactのみ)

【段B: gameplay-engineer 実装本体】
Editable Files(段B)：
  - natsumatsuri-interactive/src/game/dialogue/(DialogueController実装・店主会話データ=GDD §3.1の全セリフ・状態遷移。three/react import禁止の純TS)
  - natsumatsuri-interactive/src/ui/(Dialogue.tsx 会話ボックス+選択肢コンポーネント。HudRootから描画される)
  - natsumatsuri-interactive/src/scenes/approach/ApproachScene.ts(近接中にE/左クリックで transition('dialogue') する配線のみ。T-003が残した接続点。最小変更)
  - natsumatsuri-interactive/src/App.tsx(具象DialogueControllerの注入1〜数行のみ)
  - natsumatsuri-interactive/tests/game/(dialogue状態遷移のunit test)
Forbidden Changes(段B)：src/core/(段Aで確定した契約に従う。変更要は報告), src/world/, src/audio/, scenes/dialogue/DialogueScene.ts(段Aの所有。表示イベント契約に従う), _parallel-r3f/, docs/**(仕様疑義は報告)

Acceptance Criteria：
  AC1. 屋台の近接圏(T-003のproximity)でEキーまたは左クリックすると 'dialogue' へ遷移し、会話が開始する。圏外では何も起きない
  AC2. 会話中、背景に参道world(屋台・店主・提灯)が描画され続ける(屋台が見える)。プレイヤーは移動しない
  AC3. 店主のセリフがGDD §3.1の文言どおりに表示される(「おう、いらっしゃい!…」「ポイは一枚。破れたら…」)。1文字ずつ送り(約30字/s)、送り中の入力で全文即時表示(INTERACTION_SPEC §3.2)
  AC4. クリック/Enter/Spaceでセリフ送り。最後に選択肢「遊んでいく」「またあとで」を表示。↑↓またはマウスホバーでフォーカス移動、Enter/クリックで確定(マウスのみ・キーボードのみ両方で操作完結)
  AC5. 「遊んでいく」→ goldfish へ遷移(※goldfishシーンはT-005/006で未実装のため、遷移要求の発火=transition呼び出しまでを実装し、未登録シーンへの遷移はSceneManagerがthrowする。T-004ではgoldfish遷移を安全に扱う: goldfish未登録時はコンソール例外を出さずプレースホルダではなく『この先はT-005/006』をコードコメントで明記し、暫定で approach へ戻すか dialogue を閉じる。ダミーのgoldfish画面は作らない)。「またあとで」→ 店主「おう、また来な!」表示後 approach へ戻る
  AC6. Escで会話を打ち切り approach へ戻る(INTERACTION_SPEC §3.2)。どの状態からも参道へ戻れる(行き止まりなし)
  AC7. 各操作で音響イベントを発火する(AUDIO_SPEC §4: dialogue-next/select/confirm を 'sfx:play' で。音そのものはT-008。発火のみ実装)
  AC8. UIはART §2準拠(テキスト#f5f0e8、選択フォーカス#ff9d45、80%透過パネル)。テキスト16px以上、フォーカスリング表示(INTERACTION_SPEC §5)
  AC9. 会話状態遷移ロジックが純TS(game/dialogue)でunit test化(開始→セリフ送り→選択肢→各分岐、Esc打ち切り)
  AC10. 品質ゲートG1全通過(typecheck/lint/test/build)。E2E(test:e2e)で「近接→E→会話開始→送り→『またあとで』→approach復帰」が通る。新規依存なし(three/Reactのみ)。TODO/ダミー画面なし。実GPUでFPS50以上維持。reports/screenshots/T-004-dialogue.png 保存
Tests：tests/game/dialogue.test.ts(状態遷移)、e2e/dialogue.spec.ts(近接→会話→復帰)。コマンド: npm run typecheck && lint && test && build && test:e2e
Evidence：4ゲート+test:e2eの結果、reports/screenshots/T-004-dialogue.png、会話の全分岐を辿った確認手順、FPS実測(GPUフラグ明記)
Risks：
  (1) goldfishシーン未実装で遷移先がない → AC5の方針どおり安全に扱い、ダミー画面を作らない。T-005/006完了後にgoldfish遷移を有効化(T-006で結線)
  (2) 背景world描画の共有でApproachScene/DialogueSceneの責務が混ざる → DialogueSceneはApproachSceneのrenderを呼ぶだけにし、worldの所有はApproachSceneのまま
  (3) React HUDとSceneManager状態の同期ズレ → EventBus単一経路で駆動、HudRootは購読のみ
  (4) 1文字送りのタイマーリーク → DialogueScene/コンポーネントのcleanupで解除
Status：COMPLETE(2026-06-13。段A基盤=technical-architect(f3a87b4)→段B実装=gameplay-engineer→ループ2でMajor2件(キーボードSFX/選択の二重遷移)+Minor(プロンプト残留)を修正。レビュー: critical-reviewer=APPROVE(REV-T-004-1差し戻し→REV-T-004-2解消確認) + interaction-designer=条件付き合格の指摘を解消。test110件/e2e6件。T-006でApp.routeChoiceのgoldfish未登録フォールバックtry/catchを本遷移に差し替える)
```

---

## T-005 詳細タスクカード(5番目の実装タスク — ゲームの核心ロジック)

VS要件4「金魚すくいを遊べる」・5「ポイの移動速度・水の抵抗・紙の耐久値が結果に影響する」・6「金魚をすくうか、ポイが破れて失敗する」の**ロジック部分**。描画(水槽・ポイ・金魚・HUD)はT-006。本タスクは純TSのドメインロジックとunit testに限定する(D-003)。

```
Task ID：T-005
Owner：gameplay-engineer
Reviewer：critical-reviewer(総合) + game-director(手触り・バランス所見)
Goal：金魚すくいの物理・判定・金魚AI・セッション進行を、three/react/DOM非依存の純TSで実装し、unit testで「ポイ速度・水の抵抗・紙耐久が結果に影響する」「すくう/破れる」を固定する。T-006(描画)が状態を読んで描けるAPIを提供する
User Story：プレイヤーとして、ポイをそっと動かせば長持ちし速く動かすと破れる緊張感の中で金魚をすくいたい(VS要件4・5・6)
Inputs：docs/GAME_DESIGN_DOCUMENT.md(§4 全体, 特に §4.3 物理パラメータ表=変数名・初期値・単位の正, §4.4 ルール, §4.5 金魚AI, §5 HUDが必要とする値), docs/TECHNICAL_ARCHITECTURE.md(§2 game/はthree/react import禁止・Vitestで完全テスト可能に, §3 GameEvents goldfish:caught/poi-torn/finished), docs/AUDIO_SPEC.md §4(catch/secure/fish-escape/paper-warning/paper-tear の発火タイミング=ロジックが状態変化として表現), docs/DECISION_LOG.md D-003
Editable Files：
  - natsumatsuri-interactive/src/game/goldfish/(params.ts=全パラメータ一元管理, poi.ts, fish.ts, session.ts, index.ts 等。純TS・three/react/DOM import禁止)
  - natsumatsuri-interactive/tests/game/(goldfishロジックのunit test)
Forbidden Changes：
  - src/scenes/goldfish/(描画はT-006), src/scenes/*, src/world/, src/ui/, src/audio/, src/core/(GameEvents追加が必要なら報告), src/App.tsx, _parallel-r3f/, docs/**, package.json, 設定ファイル
  - three/react/DOM の import(game/はlintで禁止)。新規依存追加。git commit/push
  - スコープ外: 描画・HUDコンポーネント(T-006)、音の実装(T-008。本タスクは状態/イベントの表現まで)、追加屋台
Acceptance Criteria：
  AC1. src/game/goldfish/params.ts に GDD §4.3 の全パラメータ(poiFollowLag, waterDragFactor, paperDurability, wetDamagePerSec, speedDamageCoeff, fishWeightDamage, liftSpeedMax, fishEscapeRadius, fishCruiseSpeed, fishFleeSpeed, sessionTimeLimit, fishCount, poiRadius, dipDepth)を変数名・初期値どおり定義し一元管理する(他モジュールはここを参照、値の分散ハードコード禁止)
  AC2. ポイ物理: カーソル目標位置への慣性追従(空中=時定数poiFollowLag、水中=poiFollowLag×waterDragFactor)。submerge(沈める)/lift(持ち上げ)状態を持つ。dtベースでフレームレート非依存
  AC3. 紙耐久: 水中滞在で wetDamagePerSec/s、水中移動で speedDamageCoeff×speed²/s のダメージ、金魚を載せて持ち上げた瞬間 fishWeightDamage。耐久0でポイ破損(status=torn)。「速く動かすと一気に破れる/そっと動かせば長持ち」がspeed²項で成立すること
  AC4. すくい判定(GDD §4.5): ポイ持ち上げ時、金魚中心がポイ円内(poiRadius)かつポイ水平速度≤liftSpeedMax で捕獲。速度超過なら金魚は逃げ捕獲失敗(耐久ダメージ無し)。お椀へ確保(secure)で確保数が増える
  AC5. 金魚AI(GDD §4.5): 通常はwander(fishCruiseSpeed)、水中のポイがfishEscapeRadius内に来るとポイと逆方向へfishFleeSpeed(0.8s持続)。水槽境界で滑らかに転回。乱数は決定論的シード(再現可能・テスト可能。core/rng非依存でgame内に閉じたseeded PRNG可)
  AC6. セッション進行(session.ts): sessionTimeLimit のカウントダウン、捕獲/確保数の記録、status遷移(playing→won/torn/timeout)。耐久0でtorn即終了、時間切れでtimeout、退出(quit)も表現。update(dt, input)の単一APIで進行(input=目標位置・submerge・secure等)。T-006が状態を読めるよう公開状態(ポイ位置/耐久/金魚配列/確保数/残時間/status)を提供
  AC7. 状態変化の表現: 捕獲成立・確保・金魚逃げ・耐久警告(残30以下、初回)・破損 を、T-006/音響が拾えるよう戻り値かイベント記述子で表現する(本タスクではEventBus発火配線はせず、状態/イベント記述子の生成まで。GameEvents goldfish:caught/poi-torn/finished に対応する情報を持つ)
  AC8. 純TS・テスト可能: three/react/DOMを一切importしない。update(dt,input)は副作用が状態に閉じる。unit testで以下を必ず実証: (a)速いポイ移動が遅い移動より早く耐久を失い破損に至る(speed²の影響)(b)水中の追従が空中よりwaterDragFactor倍遅い(c)liftSpeedMax以下で捕獲成立・超過で失敗(d)耐久0でtorn・時間切れでtimeout(e)金魚がfishEscapeRadiusで逃げる(f)パラメータを変えると結果が変わる(値が結果に影響することの証明)
  AC9. 品質ゲートG1全通過(typecheck/lint/test/build)。新規依存なし。TODO/ダミーなし。テスト件数と各AC対応を報告
Tests：tests/game/goldfish/ に poi(物理・耐久)、fish(AI・逃避)、session(進行・status・捕獲/確保)、params影響(AC8)のunit test。コマンド: npm run typecheck && lint && test && build
Evidence：4ゲート結果、テスト件数、AC8の各実証テスト名と結果、公開APIの型シグネチャ(T-006への引き継ぎ)
Risks：
  (1) 物理の数値が体感と乖離 → GDD §4.3初期値を厳守。game-directorが手触り所見。バランス調整はGDD更新→params反映の順(コード直接調整禁止)
  (2) 金魚AIの乱数で非決定論化しテスト不能 → seeded PRNGで決定論化(seedを注入可能に)
  (3) speed²ダメージの単位/スケール誤り → speed[m/s]²×coeff[pt·s²/m²]=pt/s の次元を合わせ、テストで「1m/sで〜pt/s」を固定
Status：COMPLETE(2026-06-14、ループ1。レビュー: critical-reviewer=APPROVE(REV-T-005-1) + game-director=合格。設計判断を裁定しGDD v1.1へ反映=複数同時捕獲可・結果数=secured基準・§4.6手触り指針。新規52テスト/計162件。公開API: GoldfishSession.update(dt,input)→GoldfishEvent[] + snapshot()。T-006が描画/HUD/EventBus発火を担う)
```

---

## T-006 詳細タスクカード(6番目の実装タスク — 金魚すくいを遊べる状態にする)

VS要件4「金魚すくいを遊べる」・5「ポイ速度・水の抵抗・紙耐久が結果に影響」・6「すくう/破れる」の**描画と統合**。T-005の純TSロジック(GoldfishSession)を画面に出し、操作・HUD・音響イベント発火・会話からの遷移を結線して、実際に遊べる状態にする。

```
Task ID：T-006
Owner：gameplay-engineer
Reviewer：art-director(視覚) + critical-reviewer(総合)
Goal：会話「遊んでいく」から金魚すくいシーンへ入り、マウス/キーボードでポイを操作して金魚をすくい、紙が破れるか時間切れ/退出でセッションが終わるまでを、ART準拠の描画とHUD・音響イベント発火つきで遊べるようにする
User Story：プレイヤーとして、屋台で実際に金魚すくいを遊び、そっと動かして金魚をすくい、雑に動かすと紙が破れる手応えを体験したい(VS要件4・5・6)
Inputs：docs/GAME_DESIGN_DOCUMENT.md(§4 全体, §4.1構成=俯瞰水槽・お椀, §4.2操作モデル, §4.6手触り/破損予兆の描画要請, §5 HUD), docs/ART_DIRECTION.md(§2 水面#1e4d6b op0.85・金魚#e84a30(emissive#3a0f08弱)/白#f5f0e8・ポイ枠#e8c87a/紙#f5f0e8(耐久で op0.95→0.4)・UIテキスト#f5f0e8, §5カメラ goldfish=俯角70°固定・水槽が画面70%), docs/INTERACTION_SPEC.md(§3.3 goldfish入力表=マウス追従/押下沈める/解放持ち上げ/お椀上クリックで確保/矢印・Spaceの代替/Esc退出, §4文言 goldfish開始ヒント), docs/AUDIO_SPEC.md(§4 poi-dip/poi-lift/catch/secure/fish-escape/paper-warning/paper-tear), docs/TECHNICAL_ARCHITECTURE.md(§3 GameEvents/Scene/合成点App), reports/CURRENT_STATUS.md(§0-5 T-005公開API/座標系/イベント写像)
Editable Files：
  - natsumatsuri-interactive/src/scenes/goldfish/(新規。GoldfishScene: 水槽・ポイ・金魚・お椀の描画、GoldfishSession駆動、入力組み立て、GoldfishEvent→EventBus/sfx写像、俯角70°カメラ)
  - natsumatsuri-interactive/src/ui/(GoldfishHud: 残時間・耐久ゲージ・確保数・開始ヒント。HudRootに会話と排他で組み込む)
  - natsumatsuri-interactive/src/App.tsx(合成点: GoldfishScene生成・登録・注入、会話「遊んでいく」→goldfishの本結線=routeChoiceのフォールバックtry/catch撤去、goldfish:finished→遷移)
  - natsumatsuri-interactive/src/core/SceneManager.ts(**この1行のみLead承認の例外**: ALLOWED_TRANSITIONSのgoldfishに 'approach' を一時追加し goldfish→approach の退出を許可。result(T-007)未実装の間の行き止まり回避。コメントで「T-007でresult経由に差し替え」を明記。これ以外のcore変更は禁止)
  - natsumatsuri-interactive/src/index.css(goldfish HUDのスタイル)
  - natsumatsuri-interactive/tests/(goldfish統合の入力組み立て・イベント写像の純TS部分)、natsumatsuri-interactive/e2e/(goldfishのE2E)
Forbidden Changes：
  - src/game/goldfish/(T-005の確定ロジック。利用のみ。バランス変更はGDD経由)
  - src/world/, src/scenes/approach(プロンプト等は触らない), src/scenes/dialogue/, src/audio/, src/core/(SceneManagerの上記1行を除く), _parallel-r3f/, docs/**(疑義は報告), package.json, 設定ファイル
  - 新規依存追加(three/Reactのみ)。git commit/push
  - スコープ外: 結果画面・店主の反応・報酬(T-007)、音の実装(T-008。本タスクはsfx:play発火まで)、花火・仕上げ(T-009)
Acceptance Criteria：
  AC1. 会話「遊んでいく」を選ぶと goldfish シーンへ遷移する(App.routeChoiceのgoldfish未登録フォールバックを撤去し本遷移にする)。dialogue→goldfish が実際に動く
  AC2. 俯瞰の水槽(楕円・水面#1e4d6b op0.85)が画面の約70%を占め、カメラは俯角70°固定(ART §5)。お椀(確保先)が見える。GoldfishSessionのbounds(楕円rx0.6/rz0.45)と描画が一致
  AC3. ポイ描画: 枠#e8c87a+紙#f5f0e8。GoldfishSessionのpoi状態(position/submerged/depth)に追従。**紙の不透明度を耐久で op0.95→0.4 に変化**させ、残30以下で見た目劣化(透け/ヨレ)を段階的に強める(GDD §4.6/§5の破損予兆)
  AC4. 金魚描画: GoldfishSessionのfish[]を#e84a30(emissive#3a0f08弱)+白模様#f5f0e8で、heading方向に向けて描く。捕獲(onPoi)/逃避(fleeing)/確保(secured)の状態が見た目で分かる(ポイに乗る/跳ねる等)
  AC5. 入力(INTERACTION_SPEC §3.3, マウス・キーボード両完結): マウス移動→カーソルを水面へ投影しtargetに、左押下→submerge、左解放→持ち上げ(捕獲判定)、お椀上でクリック→secure。矢印キーでポイ移動、Spaceで沈める/持ち上げトグル、Escで退出(quit)。毎フレーム GoldfishSession.update(dt,input) を駆動
  AC6. HUD(GoldfishHud, ART §2準拠): 残時間・ポイ耐久ゲージ(+紙の見た目劣化と連動)・確保数(お椀の金魚)。開始時2秒「そっと動かそう。速く動かすと紙が破れる」(INTERACTION_SPEC §4文言)。マウス不要で読める。会話オーバーレイとは排他表示
  AC7. 音響イベント発火(発火のみ。音はT-008): GoldfishEvent記述子と入力エッジを EventBus/sfx:play へ写像 — poi-dip(沈めるエッジ)/poi-lift(持ち上げエッジ)/catch/secure/fish-escape/paper-warning/paper-tear、および goldfish:caught{total}/goldfish:poi-torn/goldfish:finished{caught,reason}。二重発火しない
  AC8. 終了とフロー: 紙破損(torn)/時間切れ(timeout)/Esc退出(quit)でセッション終了し goldfish:finished を発火。終了後 approach へ戻る(T-007のresult未実装のため暫定。SceneManagerにgoldfish→approachを一時許可。コメントでT-007差し替えを明記)。行き止まりなし
  AC9. 性能: build+preview(実GPU)で金魚すくいプレイ中の?debug=1 FPSが50以上、trianglesが予算50k内、動的ライト6灯以内。update内のフレーム毎アロケーションを避ける
  AC10. 品質ゲートG1全通過(typecheck/lint/test/build)+ E2E(近接→E→会話→遊んでいく→金魚すくい操作→退出/終了→approach復帰、console error0)。新規依存なし。TODO/ダミーなし。reports/screenshots/T-006-goldfish.png 保存(水槽・ポイ・金魚・HUDが映る)
Tests：tests/ に入力組み立て(カーソル→水面投影・secure判定の純TS部分)・GoldfishEvent→EventBus/sfx写像のunit test。e2e/goldfish.spec.ts。コマンド: typecheck && lint && test && build && test:e2e
Evidence：4ゲート+e2e結果、FPS実測(GPUフラグ明記)・triangles値、reports/screenshots/T-006-goldfish.png、会話→金魚すくい→終了→復帰の通し確認手順
Risks：
  (1) カーソル→水面投影(俯角70°カメラ)のずれ → レイキャストか平面投影で水面平面に正確に当てる。テストで投影関数を固定
  (2) GoldfishEventとエッジ発火の二重/取りこぼし → 発火は単一経路、submergeエッジはT-004同様の立ち上がり検出。e2eとunitで確認
  (3) 紙の不透明度劣化が水中で見えにくい → op範囲と劣化表現をART §2/§4.6に合わせ、art-director視覚レビュー
  (4) goldfish→approach一時許可がT-007で残置 → コメント明記し、T-007でresult経由へ必ず差し替え(CURRENT_STATUSにも記録)
Status：COMPLETE(2026-06-14、ループ1。レビュー: critical-reviewer=APPROVE(REV-T-006-1) + art-director=合格(ART §2に器の色/goldfishフォグ密度0.12/紙劣化式を明文化)。新規29テスト/計191件・e2e8件。実GPU FPS120/triangles2812。core/SceneManagerにgoldfish→approach一時許可(T-007でresult経由へ差し替え))
```
