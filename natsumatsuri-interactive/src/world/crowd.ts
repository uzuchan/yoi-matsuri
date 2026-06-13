import { CapsuleGeometry, Group, InstancedMesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { APPROACH, jitterRange, PALETTE } from './palette'
import type { WorldObject } from './types'

// ART §3 群衆: 単純化人型(高さ1.5〜1.8m)、無発光、参道脇に15〜20体。
const CROWD_COUNT = 18 // 15〜20 の範囲内
const HEIGHT_MIN = 1.5
const HEIGHT_MAX = 1.8

// ART §3 群衆の揺れ: 「ゆっくり揺れる」(±数度、歩行アニメは不要)。提灯と同様の index ベース
// 決定論的位相で、足元を支点にわずかに前後へ傾く(立っている人の重心移動)。
const SWAY_AMPLITUDE_RAD = (3 * Math.PI) / 180 // ±3°(±数度)
const SWAY_PERIOD_MIN = 4 // s(ゆっくり)
const SWAY_PERIOD_MAX = 7 // s

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
 * index 番目の群衆の揺れ角(ラジアン)を時刻から決定論的に返す(純TS・テスト可能)。
 * 提灯と同様、index ベースの位相・周期で ±SWAY_AMPLITUDE_RAD(±数度)をサイン揺らす。
 * 群衆は立っているので、足元を支点に前後へゆっくり傾く重心移動として使う。
 */
export function crowdSwayAngle(index: number, timeSec: number): number {
  const phase = jitterRange(index, 0, Math.PI * 2, 21)
  const period = jitterRange(index, SWAY_PERIOD_MIN, SWAY_PERIOD_MAX, 22)
  const omega = (Math.PI * 2) / period
  return SWAY_AMPLITUDE_RAD * Math.sin(timeSec * omega + phase)
}

/**
 * 群衆シルエットを InstancedMesh で構築する。
 * 各個体は足元を支点に ±数度でゆっくり前後へ傾く(ART §3「ゆっくり揺れる」。歩行アニメは不要)。
 * 無発光 MeshBasicMaterial で、夜の暗い前景からは僅かに分離しつつ遠方ではフォグに溶ける
 * シルエットにする(ライトの影響を受けない。色は CROWD_SILHOUETTE 参照)。
 * 揺れは update(dt) で instanceMatrix を毎フレーム更新する(提灯と同方式)。
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

  // 各個体の向き(静的)・揺れ軸(水平・向きに直交)・足元位置を保持し、毎フレーム書き換える。
  const facings = new Float32Array(placements.length)
  const scaleYs = new Float32Array(placements.length)
  for (let i = 0; i < placements.length; i++) {
    facings[i] = jitterRange(i, 0, Math.PI * 2, 13)
    scaleYs[i] = placements[i].height / BASE_HEIGHT
  }

  const dummy = new Object3D()
  // 足元を支点に傾けるための回転軸(個体の向きに対して横方向 = 前後へ傾く)。
  const tiltAxis = new Vector3()

  function writeMatrices(timeSec: number): void {
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]
      const lean = crowdSwayAngle(i, timeSec)
      // 揺れ軸 = 個体の向き(facing)に対して水平横方向。向きの cos/sin から決める。
      const fy = facings[i]
      tiltAxis.set(Math.cos(fy), 0, Math.sin(fy)).normalize()
      // 足元(y=0)を支点にしたいので、ピボットを足元に置いた回転を作る。
      // 1) 足元へ移動 → 2) 横軸まわりに lean 傾ける → 3) Y向きを与える。
      dummy.position.set(p.x, 0, p.z)
      dummy.quaternion.setFromAxisAngle(tiltAxis, lean)
      // 向き(Y回転)を合成。傾けてから向きを回す。
      dummy.rotateY(fy)
      dummy.scale.set(1, scaleYs[i], 1)
      // カプセルの原点は中心なので、足元支点で立たせるため中心を半身ぶん上へ。
      // 傾きで足元固定になるよう、ローカル +Y へ half をオフセットしてから回転に乗せる。
      dummy.translateY(p.height / 2)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  // 初期姿勢(揺れ0)。
  writeMatrices(0)
  group.add(mesh)

  let elapsed = 0
  return {
    object: group,
    update(dt: number): void {
      elapsed += dt
      writeMatrices(elapsed)
    },
    dispose(): void {
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
}
