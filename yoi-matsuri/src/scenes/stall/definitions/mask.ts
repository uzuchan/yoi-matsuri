import { MaskScene, MASK_DISPLAY_NAME } from './mask/MaskScene'
import { createMaskStallDialogue } from '../../../game/dialogue'
import { MASK_RESULT_RULES } from '../../../game/result'
import { INTERACT_RADIUS } from '../../../world'
import type { StallDefinition } from '../registry'

/**
 * お面屋の StallDefinition(CHOICE 原型 / 屋台#19 / P2 量産実証)。
 *
 * 選択式(物理なし)の量産実証。複数のお面から選び、選んだお面が報酬(MaskSession / MaskScene)。
 *
 * placement: 装飾屋台「お面」(world/festivalStalls.ts computeFestivalStallPlacements の kind=7)の
 * 配置 x=5.6 / z=-23.5 / 開口 -x(rotationY=-π/2)に合わせる(装飾の見た目はそのまま、近接で E →
 * ミニゲーム。装飾屋台と二重構造にならない = 同一座標へ遊技を載せる)。
 */
const MASK_STALL_ID = 'mask-stall'

/** 装飾屋台「お面」の配置(festivalStalls computeFestivalStallPlacements kind=7 と一致)。 */
const MASK_PLACEMENT_X = 5.6
const MASK_PLACEMENT_Z = -23.5

export const maskStallDefinition: StallDefinition = {
  id: MASK_STALL_ID,
  displayName: MASK_DISPLAY_NAME, // 'お面屋'
  placement: {
    position: { x: MASK_PLACEMENT_X, z: MASK_PLACEMENT_Z },
    facing: -Math.PI / 2, // 開口を参道中心(-x)へ向ける(右側屋台 rotationY=-π/2)
    interactRadius: INTERACT_RADIUS, // 3.0m
    promptY: 2.0,
  },
  createScene: (renderer) => new MaskScene(renderer, MASK_STALL_ID, MASK_DISPLAY_NAME),
  createDialogue: () => createMaskStallDialogue(),
  resultRules: MASK_RESULT_RULES,
}
