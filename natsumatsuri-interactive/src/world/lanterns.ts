import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three'
import { APPROACH, jitterRange, LANTERN_X, lanternZ, PALETTE } from './palette'
import type { WorldObject } from './types'

// ART §3 提灯の造形(単位 m)
const PAPER_RADIUS = 0.35 / 2 // 径0.35 → 半径
const BODY_HEIGHT = 0.45 // 高さ0.45の楕円体
const BAND_RADIUS = PAPER_RADIUS * 0.62 // 上下の円筒枠(本体より細い)
const BAND_HEIGHT = 0.06

// 球の分割は性能予算(三角形)を抑えるため低めに。
const SPHERE_WIDTH_SEGMENTS = 10
const SPHERE_HEIGHT_SEGMENTS = 8
const BAND_RADIAL_SEGMENTS = 8

// ART §3 揺れ ±2°、周期3〜5sでランダム位相
const SWAY_AMPLITUDE_RAD = (2 * Math.PI) / 180
const SWAY_PERIOD_MIN = 3
const SWAY_PERIOD_MAX = 5

/** 提灯の総数(両側)。 */
const TOTAL = APPROACH.lanternsPerSide * 2

/** 提灯1個ぶんの吊り位置(ワイヤー取付点 = 揺れの回転中心)。 */
export interface LanternAnchor {
  x: number
  z: number
}

/**
 * 全提灯の吊り位置を決定論的に算出する(両側 × lanternsPerSide)。
 * 左側(x=-LANTERN_X)を先に、続いて右側(x=+LANTERN_X)を並べる。
 * テストはこの関数で 24個×2側 の座標を検証する。
 */
export function computeLanternAnchors(): LanternAnchor[] {
  const anchors: LanternAnchor[] = []
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < APPROACH.lanternsPerSide; i++) {
      anchors.push({ x: side * LANTERN_X, z: lanternZ(i) })
    }
  }
  return anchors
}

/**
 * 提灯から「PointLight代表」を count 個選ぶ(ART §4: 提灯PointLightは4灯まで)。
 * 屋台(中腹 z≈-26 ≒ 提灯index約10)周辺に灯りを集中させ(3灯)、屋台前を最も明るく見せる
 * (AC6 / ART §7-4: 屋台前がシーン中で最も明るい)。残り1灯はカメラ至近の参道入口
 * (index 1 ≒ z=-2.5)へ振り、前景の土色が純黒に沈むのを防ぐ(ループ2 修正①)。
 * 屋台周辺3灯>入口1灯 の灯数比により、屋台前が最も明るい関係は維持される。
 * 決定論的(固定index)でテスト可能。
 */
export function pickRepresentativeLanterns(
  anchors: readonly LanternAnchor[],
  count: number,
): LanternAnchor[] {
  if (count <= 0 || anchors.length === 0) return []
  const picks: LanternAnchor[] = []
  const perSide = APPROACH.lanternsPerSide
  // 屋台周辺(index 9〜12)へ左右から3灯を寄せる。最後の1灯はカメラ至近の入口へ。
  // 屋台に近い順に並べ、count に応じて先頭から採用する。
  const order: number[] = [
    9 + perSide, // 屋台と同じ右側・屋台手前
    11, // 反対側(左)・屋台奥寄り
    11 + perSide, // 右側・屋台奥寄り
    1, // カメラ至近の参道入口(左 z≈-2.5)。前景の純黒沈みを防ぐ。
  ]
  for (let k = 0; k < count; k++) {
    const idx = order[k % order.length] + Math.floor(k / order.length) * perSide
    picks.push(anchors[Math.min(idx, anchors.length - 1)])
  }
  return picks
}

/**
 * 提灯列を構築する。
 * - 本体(楼円体・発光紙)/上帯/下帯 の3つのInstancedMeshが、同一の per-instance 変換を共有する。
 * - 各提灯はワイヤー取付点(吊り位置)を支点に ±2° で揺れる(update(dt)で instanceMatrix を更新)。
 * - 揺れの位相・周期は index ベースの決定論的ジッタ(再現可能)。
 */
export function createLanterns(): WorldObject {
  const group = new Group()
  group.name = 'lanterns'

  // --- ジオメトリ(構築時に一度だけ生成) ---
  // 本体: 球をY方向に潰して楕円体に。
  const bodyGeometry = new SphereGeometry(
    PAPER_RADIUS,
    SPHERE_WIDTH_SEGMENTS,
    SPHERE_HEIGHT_SEGMENTS,
  )
  bodyGeometry.scale(1, BODY_HEIGHT / (PAPER_RADIUS * 2), 1)

  // 上帯・下帯: 細い円筒を本体の上下端へオフセット(ジオメトリに焼き込む)。
  const halfBody = BODY_HEIGHT / 2
  const topBandGeometry = new CylinderGeometry(
    BAND_RADIUS,
    BAND_RADIUS,
    BAND_HEIGHT,
    BAND_RADIAL_SEGMENTS,
  )
  topBandGeometry.translate(0, halfBody, 0)
  const bottomBandGeometry = new CylinderGeometry(
    BAND_RADIUS,
    BAND_RADIUS,
    BAND_HEIGHT,
    BAND_RADIAL_SEGMENTS,
  )
  bottomBandGeometry.translate(0, -halfBody, 0)

  // --- マテリアル ---
  // 紙: 暖色 #ff9d45 を emissive で光らせる(PointLightは代表4灯のみ。残りはemissiveで灯る)。
  const paperMaterial = new MeshStandardMaterial({
    color: PALETTE.lanternPaper,
    emissive: new Color(PALETTE.lanternPaper),
    emissiveIntensity: 1.1,
    roughness: 0.85,
    metalness: 0,
  })
  // 赤帯 #c0392b。
  const bandMaterial = new MeshLambertMaterial({ color: PALETTE.lanternBand })

  const body = new InstancedMesh(bodyGeometry, paperMaterial, TOTAL)
  const topBand = new InstancedMesh(topBandGeometry, bandMaterial, TOTAL)
  const bottomBand = new InstancedMesh(bottomBandGeometry, bandMaterial, TOTAL)
  body.name = 'lantern-body'

  const anchors = computeLanternAnchors()

  // 揺れ計算用に、各提灯の吊り位置・位相・角速度を保持する。
  const anchorVecs: Vector3[] = anchors.map((a) => new Vector3(a.x, APPROACH.lanternWireHeight, a.z))
  const phases = new Float32Array(TOTAL)
  const angularSpeeds = new Float32Array(TOTAL)
  // 揺れ軸: 提灯ごとにわずかに変えると単調にならない(参道方向 z と 横方向 x の合成)。
  const swayAxes: Vector3[] = []
  for (let i = 0; i < TOTAL; i++) {
    phases[i] = jitterRange(i, 0, Math.PI * 2, 1)
    const period = jitterRange(i, SWAY_PERIOD_MIN, SWAY_PERIOD_MAX, 2)
    angularSpeeds[i] = (Math.PI * 2) / period
    // 揺れる平面の向きを少しランダムに(主に参道横方向 x、わずかに z 成分)。
    const tilt = jitterRange(i, -0.4, 0.4, 3)
    swayAxes.push(new Vector3(Math.sin(tilt), 0, Math.cos(tilt)).normalize())
  }

  // 再利用するワーク変数(フレーム毎の new を避ける)。
  const dummy = new Object3D()
  // 本体中心は吊り位置から下へ(ワイヤー → 本体上端 → 本体中心)。
  const hangDrop = halfBody + 0.05 // ワイヤー取付から本体上端までの僅かな間隔
  const localCenter = new Vector3(0, -(hangDrop + halfBody), 0)
  const rotated = new Vector3()

  // 初期姿勢(揺れ0)を書き込む。update が無くても自然に立つように。
  writeMatrices(0)

  function writeMatrices(timeSec: number): void {
    for (let i = 0; i < TOTAL; i++) {
      const angle = SWAY_AMPLITUDE_RAD * Math.sin(timeSec * angularSpeeds[i] + phases[i])
      // 吊り位置(anchor)を支点に localCenter を回転 → 本体中心のワールド座標。
      rotated.copy(localCenter).applyAxisAngle(swayAxes[i], angle)
      dummy.position.copy(anchorVecs[i]).add(rotated)
      dummy.quaternion.setFromAxisAngle(swayAxes[i], angle)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)
      topBand.setMatrixAt(i, dummy.matrix)
      bottomBand.setMatrixAt(i, dummy.matrix)
    }
    body.instanceMatrix.needsUpdate = true
    topBand.instanceMatrix.needsUpdate = true
    bottomBand.instanceMatrix.needsUpdate = true
  }

  group.add(body, topBand, bottomBand)

  let elapsed = 0
  return {
    object: group,
    update(dt: number): void {
      elapsed += dt
      writeMatrices(elapsed)
    },
    dispose(): void {
      bodyGeometry.dispose()
      topBandGeometry.dispose()
      bottomBandGeometry.dispose()
      paperMaterial.dispose()
      bandMaterial.dispose()
      body.dispose()
      topBand.dispose()
      bottomBand.dispose()
    },
  }
}
