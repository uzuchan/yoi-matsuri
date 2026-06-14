import { SuperballScene, SUPERBALL_DISPLAY_NAME } from './superball/SuperballScene'
import { createSuperballStallDialogue } from '../../../game/dialogue'
import { SUPERBALL_RESULT_RULES } from '../../../game/result'
import { INTERACT_RADIUS } from '../../../world'
import type { StallDefinition } from '../registry'

/**
 * スーパーボールすくいの StallDefinition(MINIGAME_ARCHETYPES 原型A SCOOP / 屋台#1 / P2 量産実証)。
 *
 * 「定義1件+登録1行で屋台が増える」量産性の実証(SCOOP 原型)。ポイ物理は金魚すくいの Poi を再利用し、
 * 対象だけ「ゆらゆら漂う色とりどりのボール」に差し替えている(SuperballSession / SuperballScene)。
 *
 * placement: 装飾屋台「スーパーボール」(world/festivalStalls.ts computeFestivalStallPlacements の
 * kind=13)の配置 x=5.6 / z=-43 / 開口 -x(rotationY=-π/2)に合わせる(装飾の見た目はそのまま、
 * 近接で E → ミニゲーム。装飾屋台と二重構造にならない = 同一座標へ遊技を載せる)。
 */
const SUPERBALL_STALL_ID = 'superball-stall'

/** 装飾屋台「スーパーボール」の配置(festivalStalls computeFestivalStallPlacements kind=13 と一致)。 */
const SUPERBALL_PLACEMENT_X = 5.6
const SUPERBALL_PLACEMENT_Z = -43

export const superballStallDefinition: StallDefinition = {
  id: SUPERBALL_STALL_ID,
  displayName: SUPERBALL_DISPLAY_NAME, // 'スーパーボールすくい'
  placement: {
    position: { x: SUPERBALL_PLACEMENT_X, z: SUPERBALL_PLACEMENT_Z },
    facing: -Math.PI / 2, // 開口を参道中心(-x)へ向ける(右側屋台 rotationY=-π/2)
    interactRadius: INTERACT_RADIUS, // 3.0m
    promptY: 2.0,
  },
  createScene: (renderer) => new SuperballScene(renderer, SUPERBALL_STALL_ID, SUPERBALL_DISPLAY_NAME),
  createDialogue: () => createSuperballStallDialogue(),
  resultRules: SUPERBALL_RESULT_RULES,
}
