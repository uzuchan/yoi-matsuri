# DECISION LOG — 宵祭(よいまつり)

所有者: technical-architect(追記のみ。既存エントリの書き換え禁止)

形式: ID / 日付 / 決定 / 理由 / 代替案と却下理由 / 影響

---

## D-001 (2026-06-13) 既存のVite + React 19 + TypeScriptテンプレートを維持する

- **決定**: `yoi-matsuri/` の既存構成(Vite 8, React 19, TS 6, ESLint flat config)をそのまま土台にする
- **理由**: ルール「既存のpackage.jsonとディレクトリ構成を不必要に作り直さない」。テンプレートは健全(lint/build成功確認済み)
- **代替案**: ゼロから vanilla TS で再構築 → 却下(作り直しコストに見合う利点なし。ReactはHUD/ダイアログに有用)
- **影響**: UIはReact、ゲーム本体はcanvas/WebGLという2層構成になる

## D-002 (2026-06-13) 3D描画に three を採用(react-three-fiber は不採用)

- **決定**: 依存 `three` + `@types/three` を追加する。R3Fは使わない
- **理由**: 夜の参道の奥行き、提灯の発光、フォグ、花火パーティクルはWebGLが最適。threeは実績・ドキュメント・ツリーシェイク対応が十分。R3F不採用はゲームループを自前のGameLoop(固定タイムステップ)で制御するため(Reactのレンダーサイクルと3D描画を分離し、性能予算を守りやすくする)
- **代替案**: 2D Canvas/PixiJSによる横スクロール → 却下(参道を「歩く」没入感が弱い)。Babylon.js → 却下(バンドルサイズ過大)
- **影響**: バンドル増(three は gzip ~170KB 見込み。予算500KB内)。src/ui(React)とsrc/scenes(three)の境界規律が必要

## D-003 (2026-06-13) 金魚すくいは専用シーン+純TSロジック分離

- **決定**: goldfishシーンは俯瞰固定カメラのthreeシーン。物理・判定・金魚AIは `src/game/goldfish/` の純TSモジュールに分離し、描画から独立してVitestで検証する
- **理由**: 「ポイ速度・水の抵抗・紙耐久が結果に影響する」はこのゲームの核。数値挙動をunit testで固定し、バランス調整(GDDパラメータ表)と描画を分離する
- **代替案**: 描画と一体のロジック → 却下(テスト不能、調整困難)
- **影響**: game/ は three/react import禁止(ESLint/レビューで担保)

## D-004 (2026-06-13) 音響は Web Audio API プロシージャル合成のみ

- **決定**: 外部音声ファイル・音響ライブラリ(Howler等)を使わず、全音源をWeb Audio APIで合成する
- **理由**: ライセンスリスク0、転送量0、依存0。祭囃子・虫の声・水音は合成で十分表現可能。リミッタをマスターに挟み事故防止
- **代替案**: CC0音源の同梱 → 却下(出所管理コストと容量)。Howler → 却下(ファイル再生が主用途のライブラリで、合成には不要)
- **影響**: audio-directorの実装難度は上がるが、AUDIO_SPECに合成レシピを明文化して対応

## D-005 (2026-06-13) テストは Vitest + Playwright

- **決定**: devDependencies に `vitest`、`@playwright/test` を追加する
- **理由**: VitestはViteと設定共有でき高速。E2E(WebGL動作・コンソールエラー検出・主要動線)はPlaywrightが標準的で、品質ゲートG2の自動化に必須
- **代替案**: Jest → 却下(Vite統合が冗長)。E2Eなし → 却下(品質基準に主要操作のE2Eが含まれる)
- **影響**: Playwrightブラウザバイナリのダウンロードが初回必要

## D-006 (2026-06-13) 状態管理は自前ステートマシン+型付きEventBus

- **決定**: Redux/Zustand等は導入しない。SceneManager(シーン状態機械)と型付きEventBusをsrc/coreに実装する
- **理由**: 状態はシーン遷移+少数のゲーム値のみ。汎用状態管理は過剰。型付きイベントマップで「stringイベントの野放し」を防ぐ
- **代替案**: Zustand → 却下(HUD表示程度ならReactのpropsとイベント購読で足りる)
- **影響**: HUDへの値伝搬はEventBus購読のカスタムフックで行う

## D-007 (2026-06-13) TypeScript strict モードを有効化する

- **決定**: tsconfig.app.json に `"strict": true` を追加する(現テンプレートは未設定)
- **理由**: 品質基準「型エラー0件」はstrictでなければ意味が薄い。コード量が少ない今が導入の唯一の好機
- **代替案**: 現状維持 → 却下
- **影響**: T-001で対応。以後の全コードがstrict前提

## D-008 (2026-06-13) 会話/結果オーバーレイのアーキテクチャ(T-004 基盤)

- **決定**: 会話(dialogue)は以下の構成で実装する。
  1. **dialogue は SceneManager のシーン**として扱う(既存 ALLOWED_TRANSITIONS `approach→dialogue→{approach,goldfish}` を活用)。新たな状態管理機構は足さない(D-006継承)。
  2. **DialogueScene は独自の 3D 世界を構築しない**。注入された **ApproachScene 参照の `render(alpha)` を呼んで背景に参道world(屋台・店主・提灯)を描画**する(屋台が会話中も見える)。world の所有は ApproachScene のまま。DialogueScene は ApproachScene.update を呼ばないため、プレイヤー移動・カメラ追従は会話中停止する。
  3. **会話ボックス・選択肢は React HUD オーバーレイ**(`src/ui/HudRoot.tsx` + 段Bの `src/ui/Dialogue.tsx`)で表示する。HUD は EventBus の `dialogue:view-changed` を購読して表示状態を React state へ橋渡しするのみ(購読専用・単一経路同期)。
  4. **会話ロジックは three/react 非依存の純TS**(`src/game/dialogue/`、段B)。その契約 **`DialogueController` / 表示状態型 `DialogueView` を core に置く**(`src/core/Dialogue.ts`)。これにより依存方向(game→core / scenes→core / ui→core)を守ったまま game(実装)・scenes/dialogue(駆動)・ui(表示)が同じ型を共有する。注入(DI)で結線する。
  5. **入力は2経路をDialogueControllerへ集約**する。キーボード(送り/選択/Esc)は DialogueScene が InputManager をポーリングし(立ち上がりエッジを自前検出)controller を呼ぶ。クリックは React オーバーレイが controller を直接呼ぶ。どちらも同一の controller メソッドに集約する。
  6. **表示状態更新イベント `dialogue:view-changed`** を GameEvents 型マップへ追加(承認: technical-architect)。payload はプレーンな `DialogueView`(three/react 非依存)。
  7. **App.tsx は「合成点」**。シーン生成・登録、DialogueScene への DI(ApproachScene 参照・具象 DialogueController・遷移ハンドラ)、HudRoot への controller 引き渡しを行う。Scene は SceneContext から SceneManager を参照できない core 設計のため、遷移は合成点で `SceneManager.transition` を束縛したハンドラを `setTransitionHandler` で注入する。合成点は機能オーナー(段B = gameplay-engineer)が具象注入のため最小編集してよい。
- **理由**: (a)屋台を背景に出す要求(AC2)を world 重複構築なしに満たせる(ApproachScene の render 再利用)。(b)テキスト送り・選択肢・フォーカスリングは DOM/React が最も実装しやすく、3D描画予算を消費しない(D-001のReact=UI方針に合致)。(c)会話状態機械を純TSに切り出すと Vitest で全分岐をテストでき、描画と独立する(D-003と同じ分離原則)。(d)契約を core に置くことで game が three/react を持ち込まずに済み、モジュール境界(§2)を保てる。(e)入力2経路を1つの controller へ集約すると SceneManager 状態と HUD のズレ(Risk 3)を単一経路で防げる。
- **代替案と却下理由**:
  - 会話ボックスも three(Sprite/canvasテクスチャ)で描く → 却下。テキスト折返し・フォーカスリング・アクセシビリティ(16px/コントラスト, INTERACTION_SPEC §5)を自前実装する負担が大きく、React の利点を捨てる。
  - DialogueController を game に置き scenes/ui が game を import → 却下。ui→game / scenes→game の依存が生じモジュール境界(§2)に反する。契約は core が正しい所在。
  - dialogue を専用 three シーンとして参道worldを再構築 → 却下。world 二重所有で責務が混ざり(Risk 2)、リソースも重複する。
  - 会話のために汎用状態管理(Zustand 等)を導入 → 却下(D-006 継承。EventBus 単一経路で足りる)。
  - Scene に SceneManager を直接渡す(SceneContext 拡張) → 却下。全シーンが遷移表を直接叩けると不正遷移の温床。遷移ハンドラ注入で必要なシーンにだけ許可する。
- **影響**: core に `Dialogue.ts`(契約)を追加、GameEvents に `dialogue:view-changed` を追加、InputManager の追跡キーに `Enter`(セリフ送り/選択確定 INTERACTION_SPEC §3.2)を追加。新規依存はなし(three/React のみ)。段Bは game/dialogue(具象 controller・会話データ)と ui/Dialogue(表示)を実装し、App.tsx の合成点で注入、ApproachScene に E/クリック→`transition('dialogue')` を足す。goldfish 遷移は T-005/006 まで未登録のため安全に approach へフォールバックする(AC5)。
