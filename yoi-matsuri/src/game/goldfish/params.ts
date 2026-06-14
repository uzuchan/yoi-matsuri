/**
 * 金魚すくいの物理・ルールパラメータ(GDD §4.3 物理パラメータ表)。
 *
 * three / react / DOM 非依存の純データ(TECHNICAL_ARCHITECTURE §2 / D-003)。
 * **値の正(唯一の出典)は GAME_DESIGN_DOCUMENT.md §4.3**。他モジュール(poi/fish/session)は
 * 必ずここを参照し、各所に数値をハードコードしない(GDD §6: バランス調整は GDD更新→params反映の順)。
 *
 * 単位は GDD のとおり(m, s, m/s, pt 等)。座標系は水面を基準とした水平 2D 平面 (x, z)[m]、
 * 深さは下向き正の depth[m]。
 */

/** GDD §4.3 物理パラメータの型。すべて読み取り専用。 */
export interface GoldfishParams {
  /** カーソル追従の時定数(空中)[s]。小さいほど機敏に追従する。 */
  readonly poiFollowLag: number
  /** 水中での追従時定数の倍率(水の抵抗)[倍]。水中lag = poiFollowLag × waterDragFactor。 */
  readonly waterDragFactor: number
  /** 紙の耐久値(満タン)[pt]。 */
  readonly paperDurability: number
  /** 水中にいるだけで受ける毎秒ダメージ [pt/s]。 */
  readonly wetDamagePerSec: number
  /** 水中移動ダメージ係数 [pt·s²/m²]。damage/s = speedDamageCoeff × speed²。 */
  readonly speedDamageCoeff: number
  /** 金魚を載せて持ち上げた瞬間の固定ダメージ [pt]。 */
  readonly fishWeightDamage: number
  /** 持ち上げ時にこれより速いポイ水平速度だと金魚がこぼれる [m/s]。 */
  readonly liftSpeedMax: number
  /** 金魚がポイから逃げ始める距離(水中のポイのみ)[m]。 */
  readonly fishEscapeRadius: number
  /** 金魚の通常遊泳速度 [m/s]。 */
  readonly fishCruiseSpeed: number
  /** 金魚の逃避速度 [m/s]。 */
  readonly fishFleeSpeed: number
  /** 制限時間 [s]。 */
  readonly sessionTimeLimit: number
  /** 水槽内の金魚数 [匹]。 */
  readonly fishCount: number
  /** ポイ(すくい網)の円の半径 [m]。 */
  readonly poiRadius: number
  /** 沈めたときのポイの水中深さ [m]。 */
  readonly dipDepth: number
}

/**
 * GDD §4.3 の初期値。コードで勝手に変えない(GDD §6)。
 *
 * poiRadius / dipDepth は GDD §4.1 / §4.2 の本文に記載(0.09m / 0.04m)。
 */
export const DEFAULT_GOLDFISH_PARAMS: GoldfishParams = {
  poiFollowLag: 0.12,
  waterDragFactor: 3.5,
  paperDurability: 100,
  wetDamagePerSec: 4.0,
  speedDamageCoeff: 220,
  fishWeightDamage: 12,
  liftSpeedMax: 0.35,
  fishEscapeRadius: 0.18,
  fishCruiseSpeed: 0.1,
  fishFleeSpeed: 0.45,
  sessionTimeLimit: 60,
  fishCount: 8,
  poiRadius: 0.09,
  dipDepth: 0.04,
}

/**
 * 水槽の寸法(GDD §4.1: 楕円形 直径約1.2m相当)。
 * 金魚 AI の境界転回・ポイ可動域の基準。水面中心を原点とする半径(x方向・z方向)[m]。
 * GDD §4.3 のパラメータ表には含まれないが、ロジックに必要な定数として一元管理する。
 */
export interface TankBounds {
  /** x 方向の半径 [m]。 */
  readonly radiusX: number
  /** z 方向の半径 [m]。 */
  readonly radiusZ: number
}

/** 直径約1.2m の楕円水槽(GDD §4.1)。半径 0.6m を基準に、奥行きをやや浅く。 */
export const DEFAULT_TANK_BOUNDS: TankBounds = {
  radiusX: 0.6,
  radiusZ: 0.45,
}

/** 逃避状態の持続時間 [s](GDD §4.5: 0.8s 持続)。 */
export const FISH_FLEE_DURATION = 0.8

/** 耐久警告のしきい値 [pt](GDD §4.4 / AUDIO_SPEC §4 paper-warning: 残30以下で初回)。 */
export const PAPER_WARNING_THRESHOLD = 30
