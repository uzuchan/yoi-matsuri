/**
 * スーパーボールすくいコアロジック(MINIGAME_ARCHETYPES 原型A SCOOP / 屋台#1)。
 * three / react / DOM 非依存の純TS(D-003)。**ポイ物理は game/goldfish/poi.ts を再利用**(金魚無改修)。
 */
export { SuperballSession } from './session'
export type {
  SuperballInput,
  SuperballEvent,
  SuperballState,
  SuperballOptions,
} from './session'
export { Ball } from './ball'
export type { BallState, BallStatus } from './ball'
export {
  DEFAULT_SUPERBALL_PARAMS,
  SUPERBALL_POI_PARAMS,
  SUPERBALL_TANK_BOUNDS,
  SUPERBALL_PAPER_WARNING_THRESHOLD,
  SUPERBALL_COLORS,
} from './params'
export type { SuperballParams } from './params'
