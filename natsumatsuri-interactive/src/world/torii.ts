import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three'
import { APPROACH, PALETTE } from './palette'
import type { WorldObject } from './types'

// ART §3 鳥居: 高さ8m、シルエット重視・ディテール不要。色 #b03a2e。
const HEIGHT = APPROACH.toriiHeight // 8m
const PILLAR_RADIUS = 0.3
const PILLAR_SPAN = 6 // 二本柱の間隔(参道幅8mに収まる)
const KASAGI_HEIGHT = 0.6 // 笠木(最上部の横木)の太さ
const KASAGI_OVERHANG = 1.2 // 笠木が柱より左右へ張り出す量
const NUKI_HEIGHT = 0.45 // 貫(下の横木)の太さ
const NUKI_Y = HEIGHT * 0.72 // 貫の高さ位置

/**
 * 鳥居を構築する(参道終端 z≈-60)。
 * 二本柱 + 笠木(最上部の横木) + 貫(下の横木)の3部材。すべて朱 #b03a2e の単色で
 * シルエットとして見せる。低ポリ(柱は8分割円柱)。
 */
export function createTorii(): WorldObject {
  const group = new Group()
  group.name = 'torii'
  group.position.z = APPROACH.toriiZ

  const material = new MeshLambertMaterial({ color: PALETTE.torii })

  // 柱(左右)。
  const pillarGeometry = new CylinderGeometry(PILLAR_RADIUS, PILLAR_RADIUS * 1.15, HEIGHT, 8)
  for (const side of [-1, 1] as const) {
    const pillar = new Mesh(pillarGeometry, material)
    pillar.position.set((side * PILLAR_SPAN) / 2, HEIGHT / 2, 0)
    group.add(pillar)
  }

  // 笠木(最上部の横木)。柱より左右へ張り出す。
  const kasagiGeometry = new BoxGeometry(PILLAR_SPAN + KASAGI_OVERHANG * 2, KASAGI_HEIGHT, 0.6)
  const kasagi = new Mesh(kasagiGeometry, material)
  kasagi.position.set(0, HEIGHT - KASAGI_HEIGHT / 2, 0)
  group.add(kasagi)

  // 貫(下の横木)。柱の内側に収まる。
  const nukiGeometry = new BoxGeometry(PILLAR_SPAN + PILLAR_RADIUS * 2, NUKI_HEIGHT, 0.45)
  const nuki = new Mesh(nukiGeometry, material)
  nuki.position.set(0, NUKI_Y, 0)
  group.add(nuki)

  return {
    object: group,
    dispose(): void {
      pillarGeometry.dispose()
      kasagiGeometry.dispose()
      nukiGeometry.dispose()
      material.dispose()
    },
  }
}
