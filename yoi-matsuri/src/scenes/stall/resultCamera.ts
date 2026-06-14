import { PerspectiveCamera, Vector3 } from 'three'
import type { StallPlacement } from './types'

/**
 * 結果カメラの一般化(STALL_FRAMEWORK §5.3)。placement.position/facing から
 * 「屋台正面・店主寄り」の固定カメラを算出する。屋台が増えても同じ式で構図を再現する。
 *
 * 金魚の現行構図(T-009)をこの関数の placement={x:5,z:-26, facing:-π/2} のときの出力として
 * 完全に再現する(構図デグレ防止 / §5.3・§10 Risk 2)。具体的には:
 *   - カメラ位置: 屋台中心の「正面(参道側)」へ水平距離 4.5m・高さ 1.8m。
 *     金魚 placement(facing=-π/2: 開口が -x を向く)では参道側 = -x。位置 ≈ (0.5, 1.8, -23.9)。
 *   - 注視点: 店主頭部(屋台中心から開口側へ少し・高さ 1.5m)。金魚では ≈ (4.5, 1.5, -23.9)。
 *   - rig 全体を「カメラの右」方向へパンし(金魚 = world +z へ 1.8m)、店主を画面中央から左へ寄せて
 *     中央パネル背後から頭〜肩がはみ出して読めるようにする(T-009 / ART §5 構図要件)。
 *
 * 金魚の現行数値はすべて定数として保持し、placement の幾何から開口方向・正面方向を導く。
 */

// --- ART §5 result カメラの裁定数値(T-009 / REV-T-007-1 Major-2)---
const RESULT_CAMERA_FOV = 50 // ART §5: 50°
const RESULT_CAMERA_DISTANCE = 4.5 // 屋台中心へ水平距離 4.5m(正面=参道側)
const RESULT_CAMERA_HEIGHT = 1.8 // 高さ 1.8m
const RESULT_LOOK_HEIGHT = 1.5 // 注視点高さ(ほぼ店主頭部 y1.66。やや見上げる客の目線)
const RESULT_CAMERA_NEAR = 0.1
const RESULT_CAMERA_FAR = 400

// 店主は屋台 group ローカル (0.3, 0, halfD-0.5) に立つ(world/stall.ts)。開口面から少し奥。
// 屋台中心からの「店主の開口方向オフセット」と「横オフセット」。金魚の現行 world≈(4.5,_,-25.7) を再現する。
const KEEPER_OPENING_OFFSET = -0.5 // 開口方向(forward)へのオフセット(奥へ -0.5)
const KEEPER_LATERAL_OFFSET = 0.3 // 開口正面から見た横オフセット(world/stall.ts の local x=0.3)

// パン量(カメラの右方向 m)。店主を画面中央から左へ寄せる。金魚では world +z へ +1.8m。
const RESULT_KEEPER_PAN = 1.8

/** 結果カメラ算出に使う中間ベクトル(参考・テスト用に公開)。 */
export interface ResultCameraGeometry {
  /** カメラ位置 world。 */
  readonly position: { x: number; y: number; z: number }
  /** 注視点 world。 */
  readonly lookAt: { x: number; y: number; z: number }
  /** カメラ FOV。 */
  readonly fov: number
}

/**
 * placement から結果カメラの幾何(位置・注視点)を算出する純関数(three 構築前の数値を返す)。
 * テスト・構図検証に使う。computeResultCamera はこれを用いて PerspectiveCamera を組む。
 */
export function computeResultCameraGeometry(placement: StallPlacement): ResultCameraGeometry {
  const cx = placement.position.x
  const cz = placement.position.z
  const facing = placement.facing

  // 開口(=参道=カメラがある側)の単位ベクトル(水平面)。world/stall.ts は group.rotation.y=facing で
  // 屋台 group を回す。開口側(参道=カメラがある向き)は world で (sin(facing), 0, cos(facing))。
  // 金魚 facing=-π/2 では (-1, 0) = 屋台中心の -x 側 = 参道側(現行 ResultScene と一致)。
  const openX = Math.sin(facing)
  const openZ = Math.cos(facing)
  // 「カメラの右」方向(rig をこの向きへパンすると被写体が画面左へ寄る / T-009)。視線=open に対する右。
  // 金魚では (0, 1) = world +z(現行 RESULT_KEEPER_PAN_Z と一致)。
  const rightX = openZ
  const rightZ = -openX

  // 店主 world 位置: 屋台中心 +(奥行きオフセット)*(-open)+ 横オフセット * right。
  // world/stall.ts のローカル(0.3,0,halfD-0.5)を group 回転で写したものに一致する
  // (店主は開口より少し奥に立つので -open 方向へ KEEPER_OPENING_OFFSET、横へ KEEPER_LATERAL_OFFSET)。
  const keeperX = cx - openX * KEEPER_OPENING_OFFSET + rightX * KEEPER_LATERAL_OFFSET
  const keeperZ = cz - openZ * KEEPER_OPENING_OFFSET + rightZ * KEEPER_LATERAL_OFFSET

  // カメラ位置: 屋台中心の正面(参道側=open)へ水平距離 4.5m。横(right)は店主の横位置 + パン。
  // 現行 ResultScene と一致するよう、open 軸方向は中心基準・right 軸方向は店主基準 + パンにする。
  const keeperLateral = (keeperX - cx) * rightX + (keeperZ - cz) * rightZ
  const lateral = keeperLateral + RESULT_KEEPER_PAN
  const camX = cx + openX * RESULT_CAMERA_DISTANCE + rightX * lateral
  const camZ = cz + openZ * RESULT_CAMERA_DISTANCE + rightZ * lateral

  // 注視点: 店主頭部(横は店主)・奥行きは rig と同じ量だけ右へパン・高さ 1.5m。
  const lookX = keeperX + rightX * RESULT_KEEPER_PAN
  const lookZ = keeperZ + rightZ * RESULT_KEEPER_PAN

  return {
    position: { x: camX, y: RESULT_CAMERA_HEIGHT, z: camZ },
    lookAt: { x: lookX, y: RESULT_LOOK_HEIGHT, z: lookZ },
    fov: RESULT_CAMERA_FOV,
  }
}

/**
 * placement から result 専用固定 PerspectiveCamera を構築する(§5.3)。
 * aspect は最初の resize で正しく更新される(初期値 1)。
 */
export function computeResultCamera(placement: StallPlacement): PerspectiveCamera {
  const geo = computeResultCameraGeometry(placement)
  const camera = new PerspectiveCamera(
    geo.fov,
    1,
    RESULT_CAMERA_NEAR,
    RESULT_CAMERA_FAR,
  )
  camera.position.set(geo.position.x, geo.position.y, geo.position.z)
  camera.lookAt(new Vector3(geo.lookAt.x, geo.lookAt.y, geo.lookAt.z))
  return camera
}
