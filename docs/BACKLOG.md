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
| P0 | T-007 | 結果画面・店主の反応・報酬・参道へ復帰 | gameplay-engineer | game-director + critical-reviewer | 7, 8 | COMPLETE |
| P1 | T-008 | 音響一式(環境音レイヤー+効果音+AudioEngine) | audio-director | critical-reviewer | 9(音響) | COMPLETE |
| P1 | T-009 | 雰囲気仕上げ(花火・群衆の揺れ・歩行ボブ・演出磨き) | environment-engineer(+audio/gameplay小follow) | art-director + critical-reviewer | 9 | COMPLETE |
| P1 | T-010 | E2E主要動線・FPS計測・品質ゲート総点検 | qa-performance-engineer | critical-reviewer | 出荷判定 | COMPLETE |
| P1 | T-011 | 出荷判定(G3体験品質レビュー: art/game/audio director+critical-reviewer並列) | critical-reviewer | Lead Agent | 出荷判定 | COMPLETE |

注:
- T-002〜T-009の各タスクカードは、直前タスクのCOMPLETE後にexecutive-producerが詳細化する(インターフェースが確定してから書く)
- T-005とT-006を分けるのは、物理ロジック(unit test対象)と描画統合を別レビューにするため。Ownerは同一なのでファイル競合なし
- 音響(T-008)は各操作イベントが出揃った後に一括実装する。それまでのタスクはEventBusへのイベント発火だけを実装しておく(AUDIO_SPECのイベント表が契約)

## 全屋台プレイアブル化プログラム(StallFramework)

設計: reports/design/{STALL_FRAMEWORK.md, MINIGAME_ARCHETYPES.md, STALL_ROADMAP.md}。6原型(SCOOP/AIM/TIMING/TRACE/CHOICE/CARRY)で19屋台を吸収。

| フェーズ | 内容 | 状態 |
|---|---|---|
| P0 | StallFramework基盤(BaseStallSession/Registry/汎用minigameシーン/会話・結果・近接のstallId化/SceneManager D-010) | COMPLETE(2026-06-14) |
| P1 | 金魚すくいをStallDefinition化し基盤へ移行(挙動・会話・結果・見た目 完全同一) | COMPLETE(2026-06-14) |
| P2 | 量産実証: スーパーボール(SCOOP)+ お面(CHOICE) | TODO |
| P3 | AIM原型: 射的・輪投げ | TODO |
| P4 | TIMING原型(8軒): かき氷/ラムネ/とうもろこし/焼きとうきび/たこ焼き/焼きそば/カステラ/たい焼き | TODO |
| P5 | CARRY原型(4軒): りんご飴/あんず飴/チョコバナナ/わたがし | TODO |
| P6 | TRACE(型抜き)+ CHOICE残(くじ/駄菓子) | TODO |

新屋台の追加手順(P0で確立): game/<id>のStallSession実装 → scenes/<id>のStallScene → scenes/stall/definitions/<id>.ts に StallDefinition 1件 → registryにregister 1行。App無編集で近接・会話・結果・報酬が自動配線。

---

## 機能タスク(VS完成後)

| Task ID | 内容 | Owner | Reviewer | 状態 |
|---|---|---|---|---|
| T-012 | 参道の賑わい: low-poly屋台 約20軒を並べて縁日感を出す(装飾。遊べるのは既存金魚すくいのみ) | environment-engineer | art-director + critical-reviewer | COMPLETE(2026-06-14) |

詳細: 多彩な屋台(たこ焼き/射的/りんご飴/お面/わたがし等)を参道両脇に約20軒、屋号(日本語サイン)・暖簾/幕・提灯・裸電球(emissive)・陳列品で「日本の縁日」を表現。性能予算厳守(三角形≤50k/FPS≥50/動的ライト≤6)。既存の金魚すくい屋台・近接・遷移を壊さない。

---

## 出荷後フォローアップ(Vertical Slice完成後・P2。VS出荷をブロックしない)

| Task ID | 内容 | 根拠 | 優先 |
|---|---|---|---|
| F-001 | 金魚すくいの難度バランス調整(大成功が容易すぎる) | T-011 G3-3 / GDD §6.1。空中接近で逃避が立たない・空中運搬で無ダメージ・時間に余裕、で平均5匹超。GDD §6.1の方針(A仕様追加=確保/運搬に水中接触要求 / B金魚AI / C暫定数値 liftSpeedMax0.35→0.20等)から選択。複数同時捕獲のunit test追加も | P2 |
| ~~F-002~~ ✅ | ~~花火開花の白飛び低減(色相可読性)~~ **解消(2026-06-18 ビジュアル磨き)** | 粒サイズ 0.45→0.6・ピーク輝度 0.85→0.7。実機スクショで色相可読を確認(ART §3 / reports/screenshots/POLISH-burst-*) | 完 |
| F-003 | GameLoopコールバック例外のtry/catch(堅牢性) | T-001 M-3 / T-010所見。正常系非発火だが堅牢性向上 | P3 |
| ~~F-004~~ ✅ | ~~result店主シルエットの背景分離強化~~ **解消(2026-06-18 ビジュアル磨き・推奨案b)** | keeperMaterial を #0d1126 無発光 → #1b2240(プレイヤー胴と同床値)+emissive 0.9 に。glTF店主(D-009)の正規化色とも一致。実機スクショ確認(ART §5 / reports/screenshots/F004-result-*) | 完 |

---

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
Editable Files：yoi-matsuri/{package.json, tsconfig.app.json, tsconfig.node.json, vite.config.ts, vitest.config.ts(新規), playwright.config.ts(新規), eslint.config.js, index.html, src/**, tests/**(新規), e2e/**(新規), public/**}
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
  - yoi-matsuri/src/world/(新規。提灯・鳥居・屋台・群衆・ライティング・接地のビルダーモジュール群)
  - yoi-matsuri/src/scenes/approach/ApproachScene.ts(world/のオブジェクトを組み込む。T-001の地面emissive暫定値の見直しを含む)
  - yoi-matsuri/tests/world/(新規。配置計算等の純TSロジックのunit test)
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
  - yoi-matsuri/src/scenes/approach/ApproachScene.ts(プレイヤー・追従カメラ・移動・近接判定・プロンプトの統合。enter(ctx)でctx.input/ctx.eventsを使う)
  - yoi-matsuri/src/world/(新規: player.ts プレイヤー造形, movement.ts 移動/クランプの純TSロジック, proximity.ts 近接enter/leave判定, promptLabel.ts ワールド空間プロンプトラベル など。既存ファイルへの追記も可)
  - yoi-matsuri/tests/world/(移動・クランプ・近接判定のunit test)
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
  - yoi-matsuri/src/core/(DialogueController/DialogueView インターフェースと会話関連の型。GameEventsに会話表示用イベントが必要なら追加=ここで承認・実装)
  - yoi-matsuri/src/scenes/dialogue/DialogueScene.ts(新規。背景にApproachScene参照を描画、InputManager読み取り、DialogueController駆動、HUDへ表示イベント発火、Esc/選択で遷移)
  - yoi-matsuri/src/ui/HudRoot.tsx(新規。EventBus→React state ブリッジ。会話オーバーレイのマウント枠)
  - yoi-matsuri/src/App.tsx(HudRootマウント、DialogueScene登録=ApproachScene参照と具象Controllerを注入する合成点)
  - docs/DECISION_LOG.md(D-008追記), docs/TECHNICAL_ARCHITECTURE.md(§2/§3にHudRoot・scenes/dialogue・DialogueController契約・合成点としてのApp.tsxを追記)
Forbidden Changes(段A)：src/game/, src/world/, src/scenes/approach(参照公開に最小変更が要る場合のみ、render再利用のための公開メソッド追加に限定し報告), src/audio/, _parallel-r3f/。新規依存追加(threeとReactのみ)

【段B: gameplay-engineer 実装本体】
Editable Files(段B)：
  - yoi-matsuri/src/game/dialogue/(DialogueController実装・店主会話データ=GDD §3.1の全セリフ・状態遷移。three/react import禁止の純TS)
  - yoi-matsuri/src/ui/(Dialogue.tsx 会話ボックス+選択肢コンポーネント。HudRootから描画される)
  - yoi-matsuri/src/scenes/approach/ApproachScene.ts(近接中にE/左クリックで transition('dialogue') する配線のみ。T-003が残した接続点。最小変更)
  - yoi-matsuri/src/App.tsx(具象DialogueControllerの注入1〜数行のみ)
  - yoi-matsuri/tests/game/(dialogue状態遷移のunit test)
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
  - yoi-matsuri/src/game/goldfish/(params.ts=全パラメータ一元管理, poi.ts, fish.ts, session.ts, index.ts 等。純TS・three/react/DOM import禁止)
  - yoi-matsuri/tests/game/(goldfishロジックのunit test)
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
  - yoi-matsuri/src/scenes/goldfish/(新規。GoldfishScene: 水槽・ポイ・金魚・お椀の描画、GoldfishSession駆動、入力組み立て、GoldfishEvent→EventBus/sfx写像、俯角70°カメラ)
  - yoi-matsuri/src/ui/(GoldfishHud: 残時間・耐久ゲージ・確保数・開始ヒント。HudRootに会話と排他で組み込む)
  - yoi-matsuri/src/App.tsx(合成点: GoldfishScene生成・登録・注入、会話「遊んでいく」→goldfishの本結線=routeChoiceのフォールバックtry/catch撤去、goldfish:finished→遷移)
  - yoi-matsuri/src/core/SceneManager.ts(**この1行のみLead承認の例外**: ALLOWED_TRANSITIONSのgoldfishに 'approach' を一時追加し goldfish→approach の退出を許可。result(T-007)未実装の間の行き止まり回避。コメントで「T-007でresult経由に差し替え」を明記。これ以外のcore変更は禁止)
  - yoi-matsuri/src/index.css(goldfish HUDのスタイル)
  - yoi-matsuri/tests/(goldfish統合の入力組み立て・イベント写像の純TS部分)、yoi-matsuri/e2e/(goldfishのE2E)
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

---

## T-007 詳細タスクカード(7番目の実装タスク — コア物語ループの完成)

VS要件7「結果に応じた店主の反応と報酬がある」・8「ゲーム終了後、祭りの参道へ戻れる」。金魚すくい終了後に結果画面を出し、確保数に応じた店主の反応と報酬を表示し、参道へ戻す。`goldfish→result→approach` を正式結線する。

```
Task ID：T-007
Owner：gameplay-engineer
Reviewer：game-director(店主反応・報酬段の正当性) + critical-reviewer(総合)
Goal：金魚すくい終了(torn/timeout/quit)後にresultシーンへ遷移し、確保数(secured)に応じた見出し・店主のセリフ・報酬を表示し、報酬を所持品スロットに反映、「参道へ戻る」でapproachへ戻す。core/Appのgoldfish→approach一時措置をgoldfish→result→approachへ差し替える
User Story：プレイヤーとして、金魚すくいの結果に店主が反応して報酬をくれ、参道へ戻って余韻を持ちたい(VS要件7・8)
Inputs：docs/GAME_DESIGN_DOCUMENT.md(§3.2 結果別の店主の反応=見出し条件・セリフ・報酬の正、「捕獲」の定義=secured, §5 HUD所持品スロット), docs/INTERACTION_SPEC.md(§2状態遷移 result→approach, §3.4 result入力=クリック/Enterで「参道へ戻る」+報酬がHUD所持品スロットへ飛ぶ0.8sアニメ, §4文言=見出し3種/ボタン「参道へ戻る」), docs/ART_DIRECTION.md(§2 UIテキスト#f5f0e8/アクセント#ff9d45/80%透過パネル, §5カメラ result=屋台正面・店主中央, §7), docs/AUDIO_SPEC.md §4(result-success/result-fail/confirm), docs/DECISION_LOG.md D-008(会話/結果オーバーレイの枠組み), reports/CURRENT_STATUS.md §0-6(T-006引き継ぎ: goldfish:finished{caught,reason}, 差し替え接続点)
Editable Files：
  - yoi-matsuri/src/game/result/(新規。報酬段判定の純TS: caught→tier(fail/success/great)→店主セリフ/報酬ID。GDD §3.2をデータ化。three/react非依存)
  - yoi-matsuri/src/scenes/result/(新規。ResultScene: 背景にApproachScene.render再利用(屋台が見える)、結果状態をHUDへ発火、クリック/Enterで「参道へ戻る」遷移。DialogueScene/D-008のパターン踏襲)
  - yoi-matsuri/src/ui/(Result.tsx 結果オーバーレイ=見出し・店主セリフ・報酬表示・「参道へ戻る」ボタン、InventorySlot 所持品スロット=approach右下に獲得報酬を表示。HudRootに会話/金魚HUDと排他で組込)
  - yoi-matsuri/src/App.tsx(合成点: ResultScene生成・登録・注入、goldfish:finished→transition('result',payload)、所持品スロットの獲得報酬state、報酬→スロットのフライアニメ起点)
  - yoi-matsuri/src/core/SceneManager.ts(**この1行のみ**: ALLOWED_TRANSITIONSのgoldfishを ['result'] に戻す=T-006の一時 'approach' を撤去。result→['approach']は既存)
  - yoi-matsuri/src/index.css(result/所持品スロットのスタイル)
  - yoi-matsuri/tests/(報酬段判定の純TS unit test)、yoi-matsuri/e2e/(結果→復帰のE2E)
Forbidden Changes：
  - src/game/goldfish/, src/scenes/goldfish/(利用のみ。終了→resultはApp側で配線), src/scenes/approach/(プロンプト等不変。所持品スロットはui/のReact HUDで足す), src/scenes/dialogue/, src/world/, src/audio/, src/core/(SceneManagerの上記1行を除く), _parallel-r3f/, docs/**(疑義は報告), package.json, 設定ファイル
  - 新規依存(three/Reactのみ)。git commit/push。スコープ外(音実装T-008・花火/仕上げT-009・追加屋台)
Acceptance Criteria：
  AC1. 金魚すくい終了(torn/timeout/quit いずれも)で result シーンへ遷移する(App: goldfish:finished→transition('result',{caught,reason}))。core/SceneManagerはgoldfish→['result']に戻し、goldfish→approach一時措置を撤去
  AC2. 確保数(secured=finished.caught)に応じた段判定(GDD §3.2): 0匹=失敗 / 1〜2匹=成功 / 3匹以上=大成功。判定は src/game/result/ の純TSでunit test
  AC3. 見出し(INTERACTION_SPEC §4): 失敗「ポイが破れてしまった…」/成功「金魚をすくった!」/大成功「大漁!名人級!」を段に応じて表示
  AC4. 店主のセリフ(GDD §3.2のとおり): 失敗「ありゃー、破れちまったか。まあ祭りの夜は長いんだ、また挑戦しな!」/成功「おっ、やるねえ!ほら、大事にしてやんなよ。」/大成功「うおっ、名人かい!?こりゃあ参った、特別だ!」
  AC5. 報酬(GDD §3.2): 失敗=reward:candy(ラムネ風アメ)/成功=reward:bag-small(金魚袋)/大成功=reward:bag-deluxe(大きな金魚袋+出目金)。結果画面に視覚表示し、所持品スロット(approach右下HUD)へ反映(INTERACTION_SPEC §3.4の0.8sフライアニメ。複雑なら簡易でも可だが「飛んで入る」動作があること)。所持品は表示のみ(使用機能なし)だが実動作(獲得が実際に蓄積・表示される)
  AC6. 背景: result表示中も屋台・店主・提灯のワールド造形が見える(ResultSceneがApproachScene.render再利用)。会話/金魚HUDとは排他表示
  AC7. 「参道へ戻る」(クリック/Enter、INTERACTION_SPEC §3.4)で approach へ戻る。result-success(成功/大成功)/result-fail(失敗)/confirm のsfx:play発火(発火のみ)。行き止まりなし。戻った後、所持品スロットに獲得報酬が残っている
  AC8. マウスのみ・キーボードのみ両方で結果画面を進められる(§1原則)。テキスト16px+・フォーカスリング(§5)・ART §2配色
  AC9. 通しループ完成: approach→近接E→会話→遊んでいく→金魚すくい→(すくう/破れる)→result(反応+報酬)→参道へ戻る→approach が一周動作する
  AC10. 品質ゲートG1全通過+E2E(終了→result→各段表示→参道復帰、console error0)。新規依存なし。TODO/ダミーなし。実GPU FPS50以上維持。reports/screenshots/T-007-result.png 保存(結果画面=見出し・店主セリフ・報酬が屋台背景の上に)
Tests：tests/ に報酬段判定(caught→tier→セリフ/報酬)のunit test(境界0/1/2/3)、e2e/result.spec.ts(通しループ+各段)。コマンド: typecheck && lint && test && build && test:e2e
Evidence：4ゲート+e2e結果、reports/screenshots/T-007-result.png、各段(0/1-2/3+)の表示確認手順、通しループ確認、FPS実測(GPUフラグ明記)
Risks：
  (1) 段判定の境界(2匹=成功/3匹=大成功)誤り → unit testで境界固定。reasonに依らずsecured数で段判定(GDD §3.2)
  (2) 失敗見出し「ポイが破れてしまった…」がtimeout 0匹に不一致 → 既定は段(0匹)で出すが、game-directorに文言の妥当性確認を依頼(必要なら別文言をGDDで定義)
  (3) goldfish→resultへの差し替えでESCのquitフローが切れる → quitもfinished{reason:'quit'}でresultへ。退出時も結果(多くは確保分の成否)を出す。e2eで確認
  (4) 所持品フライアニメのタイマー/再描画リーク → cleanupで解除
Status：COMPLETE(2026-06-14、ループ2。レビュー: critical-reviewer=APPROVE(REV-T-007-1差し戻し→REV-T-007-2解消) + game-director=失敗見出しreason分岐裁定(GDD v1.2) + art-director=result専用カメラ裁定(ART §5)。新規/計221テスト・e2e10件・実GPU FPS120。core 1行(goldfish→[result])。Minor: 店主がパネル背後=T-009で店主オフセット検討)
```

---

## T-008 詳細タスクカード(8番目の実装タスク — 夏祭りの夜の音)

VS要件9「祭囃子・虫の声…によって夏祭りの夜を感じられる」の音響面。全音源をWeb Audio APIでプロシージャル合成し(D-004)、既に各シーンが発火している EventBus イベント(sfx:play / goldfish:* / scene:transition / stall:approach・leave)を購読して鳴らす。

```
Task ID：T-008
Owner：audio-director
Reviewer：critical-reviewer
Goal：AudioEngineと環境音レイヤー(祭囃子・虫の声・群衆)+効果音を実装し、参道→会話→金魚すくい→結果の各操作・場面に音が付く。autoplay制約に対応し、マスターにリミッタを挟んで事故を防ぐ。「夏祭りの夜」が音で立ち上がる
User Story：プレイヤーとして、参道を歩くと虫の声や遠くの祭囃子が聞こえ、操作に音が返り、夏祭りの夜にいると感じたい(VS要件9の音響面)
Inputs：docs/AUDIO_SPEC.md(全節。§2ミックス構成, §3環境音レイヤー(crickets/crowd/hayashi/fireworks), §4効果音イベントマッピング表=イベント名と合成方法の正, §5実装構造, §6品質基準), docs/DECISION_LOG.md D-004(Web Audioのみ・Howler不可), docs/TECHNICAL_ARCHITECTURE.md(§2 audioはEventBus購読のみ・ゲームがaudioを直接呼ばない, §3 GameEvents), reports/CURRENT_STATUS.md §0-7(発火済みイベント一覧)
Editable Files：
  - yoi-matsuri/src/audio/(新規。AudioEngine: context管理・resume・カテゴリGain(ambient/music/sfx)・マスターGain・DynamicsCompressorリミッタ・EventBus購読。ambient/: crickets/crowd/hayashi/fireworksSfx。sfx/: §4の各イベントの合成関数)
  - yoi-matsuri/src/App.tsx(合成点: AudioEngine生成・EventBus接続・初回ユーザー操作でresume・cleanupでdispose)
  - yoi-matsuri/tests/(音響ロジックのテスト=イベント→再生指示の写像、AudioContext非依存部分。OfflineAudioContextで非無音を確認できるなら可)
  - yoi-matsuri/src/main.tsx(必要なら初回操作resumeの配線)
Forbidden Changes：
  - src/core/(GameEvents追加が要れば報告), src/game/, src/world/, src/scenes/, src/ui/(ゲーム側はイベント発火済み。audioは購読のみ。ゲームコードからaudioを直接importしない=TECHNICAL_ARCHITECTURE §2), _parallel-r3f/, docs/(AUDIO_SPECは所有=更新可だが他は不可), package.json(依存追加禁止=Web Audioのみ), 設定ファイル
  - 外部音声ファイル・音響ライブラリ(Howler等)の追加(D-004)。git commit/push
  - スコープ外: 花火の視覚(T-009。fireworks:launch/burstの音は鳴らすが視覚はT-009)、追加屋台
Acceptance Criteria：
  AC1. AudioEngine(src/audio/): AudioContext管理、**初回ユーザー操作(クリック/キー)でresume**(autoplay制約。それ以前のイベントは破棄可)、カテゴリGain(ambient0.6/music0.5/sfx0.9)→マスターGain0.8→DynamicsCompressor→destination(AUDIO_SPEC §2)。EventBusを購読し、ゲームコードからは直接呼ばれない
  AC2. 効果音(AUDIO_SPEC §4の全イベント): prompt/interact/dialogue-next/select/confirm/poi-dip/poi-lift/catch/secure/fish-escape/paper-warning/paper-tear/footstep/result-success/result-fail を 'sfx:play'(name)購読でプロシージャル合成・再生。各音はAUDIO_SPEC §4の合成方法の意図に沿う(水音/木質クリック/鈴/ジングル等)
  AC3. 環境音レイヤー(AUDIO_SPEC §3): 虫の声(スズムシ)・群衆のざわめき・祭囃子(笛+太鼓+鉦)をプロシージャル合成しapproachで常時再生(ループの継ぎ目・位相唸りが目立たない)。花火音(fireworks:launch/burst購読、視覚はT-009)
  AC4. 空間/場面ミックス: 屋台への近接(stall:approach/leave)で祭囃子・群衆が強まる等のクロスフェード(連続距離 or イベントベースの簡易クロスフェードで可)。goldfishシーン中は環境音-6dB、resultで復帰(scene:transition購読)
  AC5. autoplay対応の確認: ブラウザで初回操作前は無音、初回操作後にAudioContextがrunningになり音が出る(コンソールにautoplay警告で機能不全にならない)
  AC6. 事故防止(AUDIO_SPEC §6): マスターにDynamicsCompressor(リミッタ)。マスター出力がフルスケール-3dBを超えない。無音・爆音・クリップがない
  AC7. テスト環境対応: AudioContextが無いnode/test環境でビルド・unit testが壊れない(AudioContext生成を遅延/ガード)。イベント→再生指示の写像など純ロジック部分をunit test
  AC8. 性能・統一感: 音の追加でFPSが落ちない(50以上維持)。操作フィードバック音は発火から50ms以内(AUDIO_SPEC §6)。全体として「夏祭りの夜」の音風景として統一感がある(audio-director自己判定+T-011で最終)
  AC9. 品質ゲートG1全通過(typecheck/lint/test/build)。新規依存なし(Web Audioのみ)。TODO/ダミーなし。ゲームコードからaudio直接import無し(grep)
  AC10. E2E: 既存E2E(test:e2e)が通り、AudioEngine導入でconsole error/pageerrorが0件のまま(autoplay警告は重大エラー扱いしないが、機能不全エラーは0)。audio-director自身がブラウザで全対象音の再生を確認(確認手順を報告)
Tests：tests/ に sfx:play name→合成関数ディスパッチの写像・カテゴリGain接続・resume状態遷移のunit test(AudioContextはモック or OfflineAudioContext)。コマンド: typecheck && lint && test && build && test:e2e
Evidence：4ゲート+e2e結果、ブラウザでの全対象音の再生確認手順と結果(各イベントを発火させて音が出たか)、リミッタ動作確認(爆音入力でクリップしない)、(可能なら)OfflineAudioContextで各音が非無音であることの確認
Risks：
  (1) テスト/SSR環境にAudioContextが無い → 生成を初回resume時まで遅延し、未対応環境はno-opで安全に
  (2) プロシージャル合成が機械的で祭りに聞こえない → AUDIO_SPEC §3の合成レシピ(五音音階の笛・太鼓パターン・スズムシのAM変調)に忠実に。audio-directorが耳で調整
  (3) リミッタ不足で爆音 → DynamicsCompressor必須、マスターGainを保守的に。複数同時発火でもクリップしないか確認
  (4) ループの継ぎ目/位相唸り → ループ素材は十分長く or 連続合成。1分放置で継ぎ目が目立たないか確認
Status：COMPLETE(2026-06-14、ループ1。レビュー: critical-reviewer=APPROVE(REV-T-008-1)。AudioEngine+効果音15種+環境音3層(虫/群衆/祭囃子)+ミックス、Web Audioのみ・依存追加なし(D-004)、autoplay対応・DynamicsCompressorリミッタ、計231テスト(offline16skip)・e2e console error0。要対応: prompt/footstepはscenes/approach未発火(T-009)、fireworks:*はGameEvents未定義(T-009))
```

---

## T-009 詳細タスクカード(9番目の実装タスク — 夏祭りの夜の仕上げ)

VS要件9の総仕上げ。未実装の**花火**(視覚+音)を入れ、群衆の揺れ・歩行ボブ・歩行音/プロンプト音の発火・結果画面の店主視認性を磨き、「提灯・花火・祭囃子・群衆・虫の声で夏祭りの夜を感じられる」を完成させる。

```
Task ID：T-009
Owner：environment-engineer(主) / 小follow: audio-director(花火音購読有効化) + gameplay-engineer(result店主オフセット)
Reviewer：art-director(視覚) + critical-reviewer(総合)
Goal：花火(打ち上げ→開花→残光)を夜空に上げ音と同期させ、群衆をゆっくり揺らし、歩行にカメラボブと足音・近接プロンプト音を付け、結果画面で店主が読める構図にする。夏祭りの夜の没入を完成させる
User Story：プレイヤーとして、参道を歩くと足音が鳴り、夜空に花火が上がって音が響き、群衆がそこにいて、夏祭りの夜に包まれたい(VS要件9の総仕上げ)
Inputs：docs/ART_DIRECTION.md(§3造形=花火パーティクル(1発120〜200粒・加算合成・重力落下+減衰・寿命1.8s・打ち上げ筋→開花→残光、群衆ゆっくり揺れ)・§2パレット(花火基本3色#ff6b9d/#ffd166/#4ecdc4)・§4ライティング(影なし)・§6性能(動的ライト6灯/三角形50k)), docs/GAME_DESIGN_DOCUMENT.md(§2 30〜45秒間隔で花火・ゲームプレイ影響なし), docs/INTERACTION_SPEC.md(§3.1 歩行ボブ=カメラ上下±0.03m・足音、近接プロンプト=フェードイン+sfx:prompt, §4 footstep 0.45s間隔), docs/AUDIO_SPEC.md(§3花火音 launch/burst, §4 prompt/footstep), reports/CURRENT_STATUS.md(§0-7 T-007店主オフセットMinor, §0-8 prompt/footstep未発火・fireworks未定義)
Editable Files：
  - 【environment-engineer】yoi-matsuri/src/world/(fireworks.ts 新規=パーティクル花火、crowd.tsに揺れ追加)、src/scenes/approach/ApproachScene.ts(花火タイマー+fireworks:launch/burst発火、歩行ボブ、footstep(0.45s間隔)/prompt(近接enter時)のsfx:play発火、群衆揺れのupdate駆動)、src/core/EventBus.ts(**GameEventsに fireworks:launch/burst の2型を追加=Lead承認の最小スコープ例外。花火イベントの発火責任はapproach、購読はaudio**)、tests/
  - 【audio-director・別follow】yoi-matsuri/src/audio/(AudioEngineのfireworks:launch/burst購読を有効化。合成関数は実装済み)
  - 【gameplay-engineer・別follow】yoi-matsuri/src/scenes/result/ResultScene.ts(result専用カメラの注視点を調整し店主がパネル背後に完全に隠れない=横へ5〜10%オフセット。art-director Minor)
  - reports/screenshots/T-009-festival.png(花火が上がっている参道)
Forbidden Changes：
  - 他エージェント所有の実装(environment-engineerはgame/ui/audio/scenes-goldfish/scenes-dialogue/scenes-result不可、audio-directorはaudio以外不可、gameplay-engineerはscenes/result以外不可)、_parallel-r3f/, docs/(ART/GDD/AUDIO/INTERACTIONは読むのみ。仕様変更は所有者へ報告), package.json(依存追加禁止), 設定ファイル, git commit/push
  - core/EventBus.tsはfireworks 2型の追加のみ(他のcore変更禁止)。スコープ外: 追加屋台、新規ゲーム機構
Acceptance Criteria：
  AC1. 花火: 夜空にART §3どおりのパーティクル花火(1発120〜200粒・加算合成・重力落下+減衰・寿命約1.8s・打ち上げ筋→開花→残光の3段階、色は#ff6b9d/#ffd166/#4ecdc4)。GDD §2の間隔(30〜45秒。ただしVSデモ視認性のため初回は早め(〜10s)に1発上げてよい)で打ち上がる
  AC2. 花火と音の同期: 打ち上げで fireworks:launch、開花(打ち上げ約1.2s後)で fireworks:burst を発火。audio-director follow でAudioEngineがこれを購読し打ち上げホイッスル/開花音を鳴らす(視覚の開花と音が同期)
  AC3. 群衆の揺れ: 群衆(InstancedMesh)がゆっくり揺れる(±数度、提灯と同様のupdate駆動。歩行アニメは不要)。静止して見えない
  AC4. 歩行ボブ+足音: プレイヤー移動中にカメラが上下±0.03m程度ボブし、0.45s間隔で footstep を sfx:play 発火(INTERACTION_SPEC §3.1/§4)。停止中は鳴らさない
  AC5. 近接プロンプト音: 屋台近接圏に入った瞬間に prompt を sfx:play 発火(stall:approach と同時。INTERACTION_SPEC §3.1)。圏内滞在中の連続発火なし
  AC6. 結果画面の店主視認性(gameplay follow): result専用カメラで店主シルエットがパネル背後に完全に隠れず、横にずれて見える(art-director Minor解消)
  AC7. 性能: 花火パーティクル追加後も実GPUで通常プレイFPS50以上、三角形50k以内、動的ライト6灯以内(花火は加算合成パーティクルで原則ライトを増やさない)。フレーム毎の過剰アロケーションを避ける(パーティクルはバッファ再利用/プール)
  AC8. パレット遵守(art-director): 花火3色がART §2内、夜の寒色×暖色の対比を壊さない。加算合成で夜空に映える
  AC9. 品質ゲートG1全通過(typecheck/lint/test/build)+E2E(既存動線が通り、花火/音追加でconsole error0)。新規依存なし。TODO/ダミーなし
  AC10. reports/screenshots/T-009-festival.png に花火が開花している参道の画を保存。実GPU FPS実測(計測コマンド明記)
Tests：花火の軌道/寿命・群衆揺れ・歩行ボブ/footstep間隔の純TS部分のunit test。コマンド: typecheck && lint && test && build && test:e2e
Evidence：4ゲート+e2e、reports/screenshots/T-009-festival.png(花火開花)、FPS実測+計測コマンド、花火と音の同期確認、footstep/prompt発火確認
Risks：
  (1) パーティクルでFPS低下/三角形超過 → Points(加算ブレンド)で1発120〜200粒に抑え、プールで再利用。50k/50fps厳守
  (2) 花火イベント(core追加)と音購読のタイミングずれ → launch→1.2s→burstを発火側で固定、audioは即時再生
  (3) 歩行ボブが酔う → ±0.03m厳守、移動中のみ。停止で減衰
  (4) 3エージェントの編集衝突 → ファイル所有を分離(environment=world/approach/core2型, audio=audio, gameplay=scenes/result)。Lead が逐次実行で競合回避
Status：COMPLETE(2026-06-14、ループ1。3エージェント: environment(花火視覚+launch/burstイベント+core2型・群衆揺れ・歩行ボブ・footstep/prompt発火) / audio(花火音購読) / gameplay(result店主オフセット)。レビュー: critical-reviewer=APPROVE(REV-T-009-1) + art-director=条件付き合格(出荷可、ART v1.1)。計265テスト・e2e10・実GPU FPS120・三角形増加なし。Minor: 花火開花の白飛び→T-011任意)
```

---

## T-010 詳細タスクカード(10番目 — 品質ゲート総点検)

Vertical Slice(要件1〜9)実装完了を受け、QUALITY_GATESの全項目を体系的に検証し記録する。コードは修正しない(問題はバグ起票して実装エージェントへ差し戻し)。

```
Task ID：T-010
Owner：qa-performance-engineer
Reviewer：critical-reviewer
Goal：QUALITY_GATES.md の G1/G2 全項目を自分で計測・検証し、合否をreports/qa/に記録する。主要動線のE2E安定性、実GPU FPS、コンソールエラー、両入力経路、フィードバックを確認し、不合格はバグ起票する
User Story：チームとして、出荷判定(T-011)の前に客観的な品質計測の証跡が欲しい。なぜなら主観レビュー(G3)の前に機械的基準(G1/G2)を満たしている確証が要るから
Inputs：docs/QUALITY_GATES.md(G1全項目, G2全項目, G4禁止事項, 計測環境), docs/INTERACTION_SPEC.md(§3 各操作とフィードバックの突合用), docs/TECHNICAL_ARCHITECTURE.md §4(性能予算), reports/CURRENT_STATUS.md(各タスクの実測値)
Editable Files：
  - yoi-matsuri/e2e/(主要動線E2Eの拡充・安定化。フレーキー対策)
  - yoi-matsuri/tests/(回帰テストの穴埋め=必要時)
  - reports/qa/(計測結果・品質ゲート合否表・FPSログ)、reports/qa/bugs/(バグ起票)
  - docs/QUALITY_GATES.md(計測手順の明確化・実測値の追記が必要な場合)
Forbidden Changes：
  - src/**(プロダクションコードは修正しない。バグはreports/qa/bugs/へ起票し実装エージェントへ差し戻す)
  - 設定ファイル(playwright.config等の変更が要ればtechnical-architectへ依頼), 他docs, _parallel-r3f/, package.json, git commit/push
Acceptance Criteria：
  AC1. G1全項目を自分で実行し合否記録: G1-1 typecheck エラー0 / G1-2 lint エラー0(warning10以下) / G1-3 test 全件成功 / G1-4 build成功・gzip500KB以下(実測値記録)
  AC2. G2-1 E2E主要動線: 起動→参道移動→会話開始→金魚すくい→結果→参道復帰 を1本の通しE2Eで検証(既存e2eで動線が分散していれば統合 or 通しスペック追加)。安定して成功(フレーキーでない=複数回連続成功を確認)
  AC3. G2-2 コンソールエラー: E2E実行中の console error / pageerror が重大0件
  AC4. G2-3 FPS: build+previewで実GPU(GPU有効フラグ明記)、approach歩行時とgoldfishプレイ時の両方を10秒サンプリングし平均50以上・下位10%が45以上を実測記録。計測条件(GL renderer, フラグ, サンプル数)を明記
  AC5. G2-4 入力経路: 主要操作がマウスのみ・キーボードのみの両方で完結することをE2E or 手動で確認(会話・金魚すくい・結果)
  AC6. G2-5 フィードバック: INTERACTION_SPEC §3の各操作に視覚または音響フィードバックがあることを表で突合(操作→フィードバック→実装確認)。フィードバック無しの操作が無いこと
  AC7. G4禁止事項チェック: TODO/FIXMEの残存(grep全体)、ダミー/未接続、未承認依存、スコープ外機能、テスト失敗残置 を全項目チェックし結果記録
  AC8. 品質ゲート合否表を reports/qa/QUALITY_REPORT.md に作成(各ゲート番号・基準・計測値・合否・証跡)。不合格項目はすべて reports/qa/bugs/ にバグ起票(症状/再現/期待/実測/影響ファイル推定/重要度)
  AC9. バンドル内訳・性能予算(三角形/draw call/動的ライト)も実測し予算内か記録(TECHNICAL_ARCHITECTURE §4)
  AC10. 自分でコードを修正していないこと(src/無変更)。発見した不具合はバグ起票のみ。E2E/QA成果物のみ追加
Tests：通し主要動線E2E(e2e/main-flow.spec.ts 等)。コマンド: 全ゲート(typecheck/lint/test/build/test:e2e)+FPS計測スクリプト
Evidence：全ゲートの実行ログ、reports/qa/QUALITY_REPORT.md(合否表)、FPSログ(approach/goldfish、計測条件込み)、バグ起票一覧(あれば)
Risks：
  (1) E2EのフレークでG2-1不安定 → リトライ/明示的待機で安定化(プロダクションコードは触らない)。安定しない根本原因はバグ起票
  (2) headless SwiftShaderでFPSが出ない → GPU有効フラグ必須(既知。T-002以降の計測条件踏襲)
  (3) フィードバック突合で抜け発見 → バグ起票(prompt/footstep等は実装済みのはず。要確認)
Status：COMPLETE(2026-06-14、ループ1。G1/G2全項目合格・バグ0件。通しE2E main-flow.spec.ts追加(全11件・複数回安定)。実GPU FPS=approach平均116/p10 85・goldfish平均119.5/p10 118。gzip209KB・三角形approach14.4k/goldfish2.8k・draw call72-75/33・動的ライト5灯。フィードバック突合抜けなし・G4禁止事項クリア。reports/qa/QUALITY_REPORT.md。T-010レビューはT-011のcritical-reviewer総合判定が兼ねる)
```

---

## T-011 詳細タスクカード(最終 — 出荷判定)

Vertical Slice(要件1〜9)実装+G1/G2(T-010)合格を受け、QUALITY_GATES G3(体験品質)を4レビュアー並列で判定し、Lead Agentが出荷可否を最終決定する。実装はしない(判定のみ。重大な問題が出たら差し戻し)。

```
Task ID：T-011
Owner：critical-reviewer(総合判定の取りまとめ) / 並列判定: art-director(G3-1) + game-director(G3-3,G3-4) + audio-director(G3-2)
Reviewer：Lead Agent(最終出荷判断)
Goal：完成したVertical Sliceに対しG3体験品質(視覚統一感・音響統一感・手触り・物語・総合)を判定し、出荷可否をLeadが決める
Inputs：docs/QUALITY_GATES.md(G3全項目), docs/PRODUCT_VISION.md(体験目標), 各仕様(GDD/ART/AUDIO/INTERACTION), reports/qa/QUALITY_REPORT.md(G1/G2結果), reports/screenshots/(全シーン), reports/reviews/(各タスクのレビュー), git log(T-001〜T-010)
判定項目(QUALITY_GATES G3):
  - G3-1 視覚統一感(art-director): ART §7の4基準すべて合格(approach花火込み/goldfish/dialogue/result)
  - G3-2 音響統一感(audio-director): AUDIO_SPEC §6の3項目+「夏祭りの夜に聞こえるか」
  - G3-3 手触り(game-director): ポイ速度・水の抵抗・紙耐久が結果に影響することを確認(要件5)
  - G3-4 物語(game-director): 会話開始→結果別の店主反応→報酬が動作(要件3・7)
  - G3-5 総合(critical-reviewer): 重大問題(Critical/Major)なし。全タスクのレビュー指摘がクローズ済み、品質ゲート全通過
Editable Files：reports/reviews/(critical-reviewerの最終判定 REV-T-011-1.md)。各director は自分の所有docへ所見追記可だが、判定は最終メッセージで返す
Forbidden Changes：src/**(判定のみ。重大問題は差し戻し起票)、_parallel-r3f/, package.json, 設定ファイル, git commit/push
Acceptance Criteria(=出荷条件)：
  AC1. G3-1 art-director が視覚統一感を合格判定(残Minor=花火白飛び/店主コントラストは出荷ブロックか明示)
  AC2. G3-2 audio-director が音響統一感を合格判定(リミッタ・ループ継ぎ目・夏祭りらしさ)
  AC3. G3-3 game-director が手触りを合格判定(ポイ速度/水抵抗/紙耐久が結果に影響=要件5)
  AC4. G3-4 game-director が物語を合格判定(会話→結果反応→報酬=要件3・7)
  AC5. G3-5 critical-reviewer が総合で重大問題なしと判定し、全品質ゲート(G1/G2/G3)通過を確認、REV-T-011-1.mdに出荷判定を記録
  AC6. Lead Agentが4判定を統合し出荷可否を決定。可ならVertical Slice完成宣言、不可なら差し戻しタスク化
Evidence：各directorのG3判定、reports/reviews/REV-T-011-1.md、品質ゲート最終合否表
Risks：
  (1) G3で重大な体験問題が判明 → 差し戻しタスク化(出荷保留)
  (2) Minorの扱いで判定が割れる → Leadが出荷ブロックか否かを最終裁定
Status：COMPLETE(2026-06-14。G3全項目判定: G3-1 art-director=合格 / G3-2 audio-director=合格 / G3-3 game-director=条件付き合格(難度緩いが要件5の核は成立) / G3-4 game-director=合格 / G3-5 critical-reviewer=APPROVE(REV-T-011-1)。**Lead最終判断: Vertical Slice出荷可**。難度バランスは出荷後P2(下記)へ)
```
