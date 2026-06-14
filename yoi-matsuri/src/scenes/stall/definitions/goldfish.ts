import { GoldfishScene, GOLDFISH_DISPLAY_NAME } from '../../goldfish/GoldfishScene'
import { createGoldfishStallDialogue } from '../../../game/dialogue'
import { GOLDFISH_RESULT_RULES } from '../../../game/result'
import { STALL_ID, STALL_POSITION } from '../../../world'
import { INTERACT_RADIUS } from '../../../world'
import type { StallDefinition } from '../registry'

/**
 * 金魚すくいの StallDefinition(StallFramework §6 / D-010)。
 *
 * 金魚すくいを「フレームワークの最初の利用者」にして設計を実証する。挙動・難度・見た目・会話・
 * 結果・報酬はすべて移行前と同一に保つ:
 *  - createScene: 現 GoldfishScene を StallScene として生成(物理・描画は無改修)。
 *  - createDialogue: 現 GoldfishStallDialogue(GDD §3.1 店主会話)。
 *  - resultRules: 現 reward.ts の値(境界・文言・報酬)を転記した GOLDFISH_RESULT_RULES。
 *  - placement: 現 STALL_POSITION / 開口の向き(group.rotation.y=-π/2)/ INTERACT_RADIUS。
 *
 * プロンプト高さは ApproachScene の従来値(2.0m)に合わせる。
 */
export const goldfishStallDefinition: StallDefinition = {
  id: STALL_ID, // 'goldfish-stall'(現 stall:approach/leave の stallId と後方互換)
  displayName: GOLDFISH_DISPLAY_NAME, // '金魚すくい'
  placement: {
    position: { x: STALL_POSITION.x, z: STALL_POSITION.z },
    facing: -Math.PI / 2, // world/stall.ts: 開口を参道中心(-x)へ向ける group.rotation.y
    interactRadius: INTERACT_RADIUS, // 3.0m(現行と同一)
    promptY: 2.0,
  },
  createScene: (renderer) => new GoldfishScene(renderer, STALL_ID, GOLDFISH_DISPLAY_NAME),
  createDialogue: () => createGoldfishStallDialogue(),
  resultRules: GOLDFISH_RESULT_RULES,
}
