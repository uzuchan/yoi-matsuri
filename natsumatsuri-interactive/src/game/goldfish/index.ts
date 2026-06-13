/**
 * 金魚すくいコアロジック(T-005 / GDD §4)。three / react / DOM 非依存の純TS(D-003)。
 *
 * 公開 API(T-006 描画/統合 が利用する):
 *  - GoldfishSession: update(dt, input) で進行し、公開状態と GoldfishEvent[] を返す核心クラス
 *  - SessionState / PoiState / FishState: 描画・HUD が読むスナップショット型
 *  - GoldfishInput / GoldfishEvent: 入力と状態変化記述子(音響/HUD への写像元)
 *  - DEFAULT_GOLDFISH_PARAMS / GoldfishParams ほか: GDD §4.3 パラメータ(一元管理)
 */
export { GoldfishSession } from './session'
export type {
  GoldfishInput,
  GoldfishEvent,
  SessionState,
  SessionStatus,
  SessionOptions,
} from './session'

export { Poi } from './poi'
export type { PoiState, Vec2 } from './poi'

export { Fish } from './fish'
export type { FishState, FishStatus } from './fish'

export { SeededRandom } from './rng'

export {
  DEFAULT_GOLDFISH_PARAMS,
  DEFAULT_TANK_BOUNDS,
  FISH_FLEE_DURATION,
  PAPER_WARNING_THRESHOLD,
} from './params'
export type { GoldfishParams, TankBounds } from './params'
