import {
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'
import { PALETTE } from './palette'
import type { WorldObject } from './types'

/**
 * 接地円(ART §4「接地感は暗色の接地円で代用」)の配置仕様。
 * 提灯柱・屋台・群衆などの足元に薄く敷く暗色の円。影マップの代替。
 */
export interface ContactCircle {
  x: number
  z: number
  radius: number
}

/**
 * 参道の地面を構築する。
 *
 * T-001の暫定 emissiveIntensity 0.9 は、HemisphereLight+PointLight 導入を踏まえ
 * 大幅に減衰する(AC6)。光源で照らされる前提なので、emissive は「光が届かない遠方の
 * フォグ際や、暖色PointLightの届かないカメラ至近の前景で純黒に沈ませない」ための
 * 下支え(0.22)に留める。土色 #3a3148 を維持(ART §2「純黒禁止」)。
 *
 * 接地円は地面よりわずかに上(y=+0.01)に置き、Zファイティングを避ける。
 */
export function createGround(contacts: readonly ContactCircle[]): WorldObject {
  const group = new Group()
  group.name = 'ground'

  // 視界を覆う大プレーン。遠方はフォグ #141a38 に沈む。
  const planeGeometry = new PlaneGeometry(400, 400)
  const planeMaterial = new MeshStandardMaterial({
    color: PALETTE.groundDirt,
    emissive: new Color(PALETTE.groundDirt),
    emissiveIntensity: 0.22,
    roughness: 1,
    metalness: 0,
  })
  const plane = new Mesh(planeGeometry, planeMaterial)
  plane.rotation.x = -Math.PI / 2
  group.add(plane)

  // 接地円(影の代用)。屋台・群衆・鳥居・縁日屋台ぶんで数が多いため、全接地円を 1 つの
  // InstancedMesh で描く(draw call を 1 に抑える / ART §6 draw call 予算)。geometry/material は
  // 全インスタンスで共有。土色をさらに暗く沈めた無発光マテリアル。
  const contactGeometry = new CircleGeometry(1, 16)
  const contactColor = new Color(PALETTE.groundDirt).multiplyScalar(0.35)
  const contactMaterial = new MeshLambertMaterial({
    color: contactColor,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: DoubleSide,
  })
  const contactMesh = new InstancedMesh(contactGeometry, contactMaterial, Math.max(contacts.length, 1))
  contactMesh.name = 'contact-circles'
  contactMesh.count = contacts.length
  const dummy = new Object3D()
  dummy.rotation.x = -Math.PI / 2
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i]
    dummy.position.set(contact.x, 0.01, contact.z)
    dummy.scale.set(contact.radius, contact.radius, contact.radius)
    dummy.updateMatrix()
    contactMesh.setMatrixAt(i, dummy.matrix)
  }
  contactMesh.instanceMatrix.needsUpdate = true
  group.add(contactMesh)

  return {
    object: group,
    dispose(): void {
      planeGeometry.dispose()
      planeMaterial.dispose()
      contactGeometry.dispose()
      contactMaterial.dispose()
      contactMesh.dispose()
    },
  }
}
