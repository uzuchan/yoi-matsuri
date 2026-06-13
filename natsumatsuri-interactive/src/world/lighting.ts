import { Group, HemisphereLight, PointLight } from 'three'
import { APPROACH, BULB_COLOR, PALETTE } from './palette'
import type { LanternAnchor } from './lanterns'
import { STALL_BULB_HEIGHT, STALL_POSITION } from './stall'
import type { WorldObject } from './types'

// ART §4 ライティング(厳守)
const HEMI_SKY = '#2a3360'
const HEMI_GROUND = '#1a1430'
const HEMI_INTENSITY = 0.5

// 提灯PointLight(4灯まで): #ff9d45 / intensity1.2 / distance6 / decay2
const LANTERN_LIGHT_COLOR = PALETTE.lanternPaper
const LANTERN_LIGHT_INTENSITY = 1.2
const LANTERN_LIGHT_DISTANCE = 6
const LANTERN_LIGHT_DECAY = 2

// 屋台PointLight(1灯): #ffd166 / intensity1.5 / distance8
const STALL_LIGHT_INTENSITY = 1.5
const STALL_LIGHT_DISTANCE = 8
const STALL_LIGHT_DECAY = 2

/** 提灯光を吊るすおおよその高さ(本体中心付近)。 */
const LANTERN_LIGHT_Y = APPROACH.lanternWireHeight - 0.4

/**
 * シーンのライティングを構築する(動的PointLightは合計5灯 = 提灯代表4 + 屋台1)。
 * 影マップは使わない(ART §4)。屋台光を最も強く・近くに置き、屋台前を最も明るくする。
 *
 * @param lanternLightAnchors 提灯のうちPointLightを置く代表位置(最大4)。
 */
export function createLighting(lanternLightAnchors: readonly LanternAnchor[]): WorldObject {
  const group = new Group()
  group.name = 'lighting'

  // 環境光(全体の最低明度を作る寒色のHemisphereLight)。
  const hemi = new HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY)
  group.add(hemi)

  // 提灯の代表PointLight(最大4灯)。
  const lanternLights: PointLight[] = []
  const used = lanternLightAnchors.slice(0, 4)
  for (const anchor of used) {
    const light = new PointLight(
      LANTERN_LIGHT_COLOR,
      LANTERN_LIGHT_INTENSITY,
      LANTERN_LIGHT_DISTANCE,
      LANTERN_LIGHT_DECAY,
    )
    light.position.set(anchor.x, LANTERN_LIGHT_Y, anchor.z)
    group.add(light)
    lanternLights.push(light)
  }

  // 屋台のPointLight(1灯)。屋台前(開口=参道中心側)を最も明るくするため、
  // 屋台中心からやや参道中心寄り(x を内側へ)に置く。
  const stallLight = new PointLight(
    BULB_COLOR,
    STALL_LIGHT_INTENSITY,
    STALL_LIGHT_DISTANCE,
    STALL_LIGHT_DECAY,
  )
  stallLight.position.set(STALL_POSITION.x - 1.0, STALL_BULB_HEIGHT, STALL_POSITION.z)
  group.add(stallLight)

  return {
    object: group,
    dispose(): void {
      hemi.dispose()
      for (const light of lanternLights) light.dispose()
      stallLight.dispose()
    },
  }
}
