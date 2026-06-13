/**
 * 金魚すくいの入力組み立て(純TS・three/react/DOM 非依存)。T-006。
 *
 * カーソル(スクリーン座標)を水面平面(水槽の 2D 座標系 x,z[m])へ投影する関数と、
 * お椀ヒット判定、キーボード移動の合成を、テスト可能な純関数として分離する(AC5 / Risk(1))。
 *
 * 座標系:
 *  - 水面 2D 平面 (x, z)[m]。水槽中心が原点。T-005 GoldfishSession と一致(DEFAULT_TANK_BOUNDS)。
 *  - スクリーンは正規化デバイス座標(NDC) ndcX,ndcY ∈ [-1, 1](左下=-1,-1 / 右上=+1,+1)。
 *
 * カメラは俯角70°固定(ART §5)。スクリーン→水面のレイ交差は GoldfishScene 側で three の
 * Raycaster を使って行うが、その結果を「水槽座標へクランプ」する純ロジックはここで持つ
 * (テストで投影後の挙動=楕円内クランプを固定する)。
 */
import type { Vec2 } from '../../game/goldfish'

/** ポイの可動範囲を表す矩形(水槽 + お椀を含む)。 */
export interface PlayArea {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

/**
 * ポイの目標位置を可動範囲(水槽+お椀を含む矩形)へクランプする。
 * ポイは確保のためお椀(水槽の外)まで運ぶ必要があるので、水槽楕円ではなく矩形でクランプする
 * (これにより poi がお椀へ到達できる)。捕獲判定は T-005 が水槽楕円基準で行うため影響しない。
 */
export function clampToPlayArea(point: Vec2, area: PlayArea): Vec2 {
  const x = point.x < area.minX ? area.minX : point.x > area.maxX ? area.maxX : point.x
  const z = point.z < area.minZ ? area.minZ : point.z > area.maxZ ? area.maxZ : point.z
  return { x, z }
}

/**
 * 矢印キーの押下からポイの追従目標を 1 ステップ移動させる(キーボード操作のマウス代替)。
 * INTERACTION_SPEC §3.3: 矢印キーでポイ移動(560 px/s 相当)。本ゲームは m 単位なので、
 * 画面サイズに依存しない一定速度 [m/s] で水面平面を動かす。
 *
 * @param current 現在の目標位置 [m]
 * @param keys    矢印キー押下状態
 * @param dt      ステップ時間 [s]
 * @param speed   移動速度 [m/s]
 * @param area    可動範囲(水槽+お椀を含む矩形。到達範囲をクランプ)
 * @returns 新しい目標位置 [m]
 */
export function keyboardTarget(
  current: Vec2,
  keys: { up: boolean; down: boolean; left: boolean; right: boolean },
  dt: number,
  speed: number,
  area: PlayArea,
): Vec2 {
  let dx = 0
  let dz = 0
  if (keys.left) dx -= 1
  if (keys.right) dx += 1
  // 画面の上(奥)= -z、下(手前)= +z(俯瞰カメラ)。
  if (keys.up) dz -= 1
  if (keys.down) dz += 1
  if (dx === 0 && dz === 0) return { x: current.x, z: current.z }
  const len = Math.hypot(dx, dz)
  const step = speed * dt
  const next = {
    x: current.x + (dx / len) * step,
    z: current.z + (dz / len) * step,
  }
  return clampToPlayArea(next, area)
}

/**
 * お椀の上にポイがあるか(お椀へ確保できる位置か)を判定する。
 * お椀は水槽の外(画面端)に固定された円。ポイ中心がその円内なら true。
 *
 * @param poi   ポイの水平位置 [m]
 * @param bowl  お椀の中心 [m]
 * @param radius お椀の判定半径 [m]
 */
export function isOverBowl(poi: Vec2, bowl: Vec2, radius: number): boolean {
  return Math.hypot(poi.x - bowl.x, poi.z - bowl.z) <= radius
}
