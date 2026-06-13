import { CapsuleGeometry, Group, InstancedMesh, MeshBasicMaterial, Object3D } from 'three'
import { APPROACH, jitterRange, PALETTE } from './palette'
import type { WorldObject } from './types'

// ART §3 群衆: 単純化人型(高さ1.5〜1.8m)、無発光、参道脇に15〜20体。
const CROWD_COUNT = 18 // 15〜20 の範囲内
const HEIGHT_MIN = 1.5
const HEIGHT_MAX = 1.8

/**
 * 群衆シルエット色(ループ2 修正②)。
 * ART §2 の指定は #0d1126(rgb 13,17,38)だが、夜の前景地面(土 #3a3148 が暗く沈んだ
 * ~#090611 相当)と明度がほぼ同じで、群衆が背景と一体化し「人がいる」と読めなかった。
 * 色相は寒色のまま据え置き、明度のみフォグ色 #141a38(rgb 20,26,56)= ART §2 で許容される
 * 上限まで持ち上げ、暗い前景地面から最小限分離する。新規色相は持ち込まない。
 * → art-director に ART §2 への追記を依頼(報告参照)。
 */
const CROWD_SILHOUETTE = PALETTE.fog // #141a38(フォグ色を上限とした明度のみの調整)

// 人型の基準ジオメトリ(高さ1mのカプセル)。インスタンスごとにY方向スケールで身長を変える。
const BASE_HEIGHT = 1
const CAPSULE_RADIUS = 0.2

/** 1体ぶんの配置(テスト用に公開)。 */
export interface CrowdPlacement {
  x: number
  z: number
  height: number
}

/**
 * 群衆の配置を決定論的に算出する(index ベースのジッタ)。
 * 参道の外側(|x| > 参道幅/2)に左右へ振り分け、屋台(中腹右側)の正面は避ける。
 * テストは体数(15〜20)と「参道上に立っていない」ことを検証する。
 */
export function computeCrowdPlacements(): CrowdPlacement[] {
  const placements: CrowdPlacement[] = []
  const half = APPROACH.width / 2 // 4m
  for (let i = 0; i < CROWD_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1
    // 参道端(±4)から外側へ 0.6〜2.6m。群衆は参道の上には立たない。
    const offset = jitterRange(i, 0.6, 2.6, 10)
    const x = side * (half + offset)
    // 奥行きは手前 z=+1 から奥 z=-55 まで散らす(鳥居の手前まで)。
    const z = jitterRange(i, 1, -55, 11)
    const height = jitterRange(i, HEIGHT_MIN, HEIGHT_MAX, 12)
    placements.push({ x, z, height })
  }
  return placements
}

/**
 * 群衆シルエットを InstancedMesh で構築する。
 * 揺れ歩行は T-009(本タスクでは静的配置)。無発光 MeshBasicMaterial で、
 * 夜の暗い前景からは僅かに分離しつつ遠方ではフォグに溶けるシルエットにする
 * (ライトの影響を受けない。色は CROWD_SILHOUETTE 参照)。
 */
export function createCrowd(): WorldObject {
  const group = new Group()
  group.name = 'crowd'

  // カプセル: 円柱長 = BASE_HEIGHT - 2r(端の半球ぶんを差し引く)。低ポリ。
  const geometry = new CapsuleGeometry(CAPSULE_RADIUS, BASE_HEIGHT - CAPSULE_RADIUS * 2, 3, 8)
  const material = new MeshBasicMaterial({ color: CROWD_SILHOUETTE, fog: true })

  const placements = computeCrowdPlacements()
  const mesh = new InstancedMesh(geometry, material, placements.length)
  mesh.name = 'crowd-instances'

  const dummy = new Object3D()
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    const scaleY = p.height / BASE_HEIGHT
    dummy.position.set(p.x, p.height / 2, p.z)
    dummy.rotation.set(0, jitterRange(i, 0, Math.PI * 2, 13), 0)
    dummy.scale.set(1, scaleY, 1)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)

  return {
    object: group,
    dispose(): void {
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
}
