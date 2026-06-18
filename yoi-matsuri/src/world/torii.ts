import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three'
import { APPROACH, PALETTE } from './palette'
import type { WorldObject } from './types'

// ART §3 鳥居: 高さ8m、シルエット重視・ディテール不要。色 #b03a2e。
// 鳥居は参道終端 z≈-60 で動的 PointLight(屋台 z=-26 / 提灯)がほぼ届かず、無発光だと純黒へ沈み、
// 参道の象徴(焦点)が死ぬ。プレイヤー/店主と同じ「純黒へ沈ませない床値」思想(ART §2)を適用し、
// 朱と同色の弱い emissive を与えて、夜空の中でもシルエット朱がほのかに読める焦点にする。
// 鳥居は z≈-60(カメラから約69m)。FogExp2(密度0.028)では色の約97%が fog 色 #141a38 へ
// 置換され、emissive だけでは靄に飲まれて焦点にならない。提灯/裸電球と同じ「夜でも読める光」の
// 扱いとして、鳥居マテリアルだけ fog を無効化し、靄を抜けて浮かぶ朱の門として読ませる。
// emissive はネオン化を避ける弱め(0.6)。fog 無効と併せて朱が読める焦点になる。
const TORII_EMISSIVE_INTENSITY = 0.6
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

  const material = new MeshLambertMaterial({
    color: PALETTE.torii,
    emissive: new Color(PALETTE.torii),
    emissiveIntensity: TORII_EMISSIVE_INTENSITY,
    // 遠方フォグに飲まれないよう鳥居だけ fog を無効化(上記コメント参照)。
    fog: false,
  })

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
