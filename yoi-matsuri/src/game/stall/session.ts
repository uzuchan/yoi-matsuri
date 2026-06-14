/**
 * BaseStallSession 契約(STALL_FRAMEWORK §1 / D-010)。
 *
 * 金魚すくいで実証済みの「純TS セッション」(GoldfishSession)を一般化した、屋台横断の遊び契約。
 * three / react / DOM 非依存の純TS(D-003)。各屋台は素直なクラスでこれを実装する
 * (抽象クラス継承ではなく契約 = テストしやすく、ジェネリクス推論破綻を避ける / §1)。
 *
 * 既存 GoldfishSession との差分:
 *  - status は屋台横断の語彙('playing'|'cleared'|'failed'|'timeout'|'quit')へ正規化する。
 *  - result() を追加し、最終成果を StallResult(score/reason/metrics)に集約する。
 *  - 状態変化記述子(TEvent)は EventBus を直接叩かない(Scene が eventMap で写像する)。
 */

/**
 * 屋台プレイのステータス(屋台横断の正規化)。
 * - 'playing': 進行中(これ以外は終了)
 * - 'cleared': 目的達成で正常終了(金魚=1匹以上確保した時間切れ等)
 * - 'failed' : 失敗終了(ポイ破損・弾切れ等、屋台固有の「もう続けられない」)
 * - 'timeout': 制限時間切れ(成果ゼロ)
 * - 'quit'   : プレイヤーが Esc で途中退出
 */
export type StallStatus = 'playing' | 'cleared' | 'failed' | 'timeout' | 'quit'

/**
 * 終了理由(屋台横断の語彙)。見出し・店主セリフの分岐に使う(§5)。tier 判定は score で決める。
 * - 'success': 目的達成で正常終了(時間内クリア等)
 * - 'timeout': 制限時間切れ
 * - 'broke'  : 失敗終了(ポイ破損・弾切れ等。金魚の 'torn' を一般化)
 * - 'quit'   : プレイヤーが Esc で途中退出
 */
export type StallEndReason = 'success' | 'timeout' | 'broke' | 'quit'

/** 1屋台プレイの最終成果(scene→result へ渡る純データ)。 */
export interface StallResult {
  /** 屋台横断の数値スコア(意味は屋台ごと: 金魚=確保数 / 射的=命中点 / 型抜き=残精度…)。 */
  readonly score: number
  /** 終了理由(屋台横断の語彙)。表示・セリフ分岐に使う(§5)。 */
  readonly reason: StallEndReason
  /** 屋台固有の補助メトリクス(任意)。tier 判定や図鑑で使う追加値。 */
  readonly metrics?: Readonly<Record<string, number>>
}

/**
 * 屋台横断の最小スナップショット契約(STALL_ROADMAP の汎用 StallHud 要件)。
 * 各屋台の TState はこれを満たすことで、汎用 HUD(残時間 + 0..1 危険度 + スコア)で表現できる。
 *  - status   : 現在のステータス
 *  - timeRemaining: 残り時間 [s](制限時間がない屋台は負値で「非表示」を表す)
 *  - danger   : 0..1 の危険度(金魚=ポイ耐久の逆、1 で最危険)。汎用ゲージ/警告に使う
 *  - score    : 現在スコア(確保数/命中点…)
 */
export interface StallSnapshot {
  readonly status: StallStatus
  readonly timeRemaining: number
  readonly danger: number
  readonly score: number
}

/**
 * 屋台セッションの契約(STALL_FRAMEWORK §1.2)。
 *
 * 型引数で各屋台固有の入力・状態・イベントを受ける(共通フレームワークは中身を規定しない)。
 * TState は StallSnapshot を拡張してよい(屋台固有の描画状態を足す)。
 */
export interface StallSession<
  TInput,
  TState extends StallSnapshot,
  TEvent,
> {
  /** 1ステップ進める。発生した状態変化記述子を返す(EventBus 非依存)。 */
  update(dt: number, input: TInput): readonly TEvent[]
  /** 描画/HUD が読む公開状態スナップショット。 */
  snapshot(): TState
  /** 現在のステータス。'playing' 以外は終了。 */
  readonly status: StallStatus
  /** 終了後の最終成果。status==='playing' のうちは null。 */
  result(): StallResult | null
}

/**
 * 全屋台で共通に欲しい「終了」記述子(§1.3)。各屋台の TEvent は
 * `StallCommonEvent | <屋台固有イベント>` のユニオンにする。Scene の eventMap は
 * 'stall-finished' を共通処理(stall:finished 発火・二重発火ガード)し、固有イベントだけ
 * 屋台ごとに写像する。これで「finished を1回だけ発火」のロジックを基盤側に1回だけ書く。
 */
export type StallCommonEvent = {
  readonly type: 'stall-finished'
  readonly result: StallResult
}
