/**
 * 屋台フレームワークの配線契約(STALL_FRAMEWORK §2 / §3 / D-010)。
 * Scene(three)・DialogueController を含むため core ではなく scenes に置く(§1.4)。
 *
 * 公開:
 *  - StallDefinition / StallRegistry: 屋台を「定義+登録」する(§2)
 *  - MinigameScene: 汎用 minigame ディスパッチャ(stallId→StallScene 委譲 / §3.2)
 *  - StallScene / StallHudState / StallPlacement: scenes 側の屋台型(§2.2/§2.6/§4.3)
 *  - computeResultCamera: 結果カメラの placement 一般化(§5.3)
 */
export { StallRegistry } from './registry'
export type { StallDefinition } from './registry'
export { MinigameScene, readStallId } from './MinigameScene'
export type { StallScene, StallHudState, StallPlacement } from './types'
export {
  computeResultCamera,
  computeResultCameraGeometry,
} from './resultCamera'
export type { ResultCameraGeometry } from './resultCamera'
