/**
 * src/world 公開API。
 * 参道シーン(scenes/approach)が環境オブジェクトのビルダーをここから取得する。
 * 各ビルダーは WorldObject({ object, dispose, update? })を返す。
 */
export type { WorldObject } from './types'
export {
  PALETTE,
  BULB_COLOR,
  FESTIVAL_ACCENTS,
  APPROACH,
  LANTERN_X,
  lanternZ,
  jitter01,
  jitterRange,
} from './palette'

export { createSky } from './sky'
export { createGround } from './ground'
export type { ContactCircle } from './ground'
export {
  createLanterns,
  computeLanternAnchors,
  pickRepresentativeLanterns,
} from './lanterns'
export type { LanternAnchor } from './lanterns'
export { createTorii } from './torii'
export { createStall, STALL_POSITION, STALL_ID, STALL_BULB_HEIGHT } from './stall'
export {
  createFestivalStalls,
  computeFestivalStallPlacements,
  FESTIVAL_STALL_COUNT,
} from './festivalStalls'
export type { FestivalStallPlacement } from './festivalStalls'
export { createCrowd, computeCrowdPlacements, crowdSwayAngle } from './crowd'
export type { CrowdPlacement } from './crowd'
export { createLighting } from './lighting'

// T-009: 花火(パーティクル)。純TSの軌道/寿命(FireworkShell)+ THREE.Points 描画。
export {
  createFireworks,
  FireworkShell,
  pickBurst,
  FIREWORK_COLORS,
  PARTICLE_MIN,
  PARTICLE_MAX,
  SHELL_POOL_SIZE,
  LAUNCH_TO_BURST,
  BURST_LIFETIME,
  SHELL_TOTAL_LIFETIME,
} from './fireworks'
export type {
  FireworkColor,
  FireworkPhase,
  FireworksObject,
  FireworksCallbacks,
  FireworksBurstArea,
  Vec3,
} from './fireworks'

// T-009: 雰囲気演出の純TSロジック(花火タイマー・足音間隔・歩行ボブ)。
export {
  FireworksTimer,
  FootstepCadence,
  walkBobOffset,
  FIREWORKS_FIRST_DELAY,
  FIREWORKS_INTERVAL_MIN,
  FIREWORKS_INTERVAL_MAX,
  FOOTSTEP_INTERVAL,
  WALK_BOB_AMPLITUDE,
  WALK_BOB_FREQUENCY,
} from './atmosphere'

// T-003: プレイヤー造形・移動/近接の純TSロジック・プロンプトラベル。
export { createPlayer } from './player'
export {
  WALK_SPEED,
  WALK_BOUNDS,
  keyboardMoveVector,
  integrateMovement,
  clampToBounds,
  mouseForwardVector,
} from './movement'
export type { Vec2, WalkBounds } from './movement'
export { ProximityTracker, INTERACT_RADIUS } from './proximity'
export type { ProximityEdge } from './proximity'
export { createPromptLabel } from './promptLabel'
export type { PromptLabel } from './promptLabel'
