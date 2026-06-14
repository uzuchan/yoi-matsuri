import type { Scene } from '../../core'

/**
 * 屋台フレームワークの scenes 側型(STALL_FRAMEWORK §2.2 / §2.6 / §4.3)。
 *
 * 配置の判断(§1.4): 純TS の遊び契約(StallSession/StallResult)は game/stall に置くが、
 * StallScene は `Scene`(three)を含み、StallHudState は React HUD の表示契約であるため scenes 側に置く。
 */

/**
 * 汎用 minigame シーンが委譲する「屋台中身」の契約(§2.2)。
 * `Scene` を実装しつつ、HUD listener を注入できる。GoldfishScene 相当。
 *
 * id は固定で 'minigame'(汎用 MinigameScene として SceneManager に登録される / §3.1)。
 * StallScene 自体は SceneManager へ直接登録せず、MinigameScene が enter payload の stallId で
 * Registry から引いて委譲する。
 */
export interface StallScene extends Scene {
  readonly id: 'minigame'
  /** HUD 状態の購読者(合成点→React 橋渡し)。GoldfishScene.setHudListener 相当。 */
  setHudListener(listener: (state: StallHudState | null) => void): void
  /** GPU リソースを解放する(idempotent)。遅延生成/破棄で dispose 漏れを防ぐ(§7 Risk 4)。 */
  dispose(): void
}

/**
 * 汎用 HUD の表示契約(§2.6)。GoldfishHudState を一般化した
 * 「残り時間 + 0..1 の汎用ゲージ + スコア」。HudRoot は会話/結果と排他で StallHud を1つ描く。
 */
export interface StallHudState {
  /** HUD を表示するか(セッション中=true、退出/終了後=false で会話/結果と排他)。 */
  readonly active: boolean
  /** どの屋台か(見出し)。 */
  readonly displayName: string
  /** 残時間 [s](制限時間がない屋台は負値で非表示)。 */
  readonly timeRemaining: number
  /** 汎用ゲージ(耐久/弾数/温度…)。null なら非表示。ratio は 0..1。 */
  readonly gauge: { readonly ratio: number; readonly label: string } | null
  /** スコア(確保数/命中点…)。 */
  readonly score: number
  /** スコアの見出しラベル('すくった' '命中' 等)。 */
  readonly scoreLabel: string
  /** スコアの単位('匹' 'pt' 等)。 */
  readonly scoreUnit: string
  /** 開始 2 秒だけ出す操作ヒント(屋台固有。空文字なら出さない)。 */
  readonly hint: string
}

/**
 * 参道上の屋台配置(§4.3)。近接判定・プロンプト位置・結果カメラの基準を単一の真実に統合する。
 */
export interface StallPlacement {
  /** 屋台中心の world 座標。 */
  readonly position: { readonly x: number; readonly z: number }
  /** 開口の向き(rad)。結果カメラの正面算出に使う。 */
  readonly facing: number
  /** 近接半径 [m](既定 INTERACT_RADIUS=3.0)。 */
  readonly interactRadius: number
  /** プロンプトラベル高さ [m]。 */
  readonly promptY: number
}
