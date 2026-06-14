/**
 * プレイヤー移動の純TSロジック(描画非依存・テスト可能)。
 * 移動積分・歩行可能範囲へのクランプ・マウスのみ前進時の屋台方向への収束を扱う。
 *
 * 座標系は world と共通(+Z=手前 / -Z=奥=鳥居、x=0=中心線、単位はメートル)。
 * GDD §2: walkSpeed 3.0 m/s。参道 幅8m(x∈[-4,4])、奥行60m(入口〜鳥居z=-60手前)。
 *
 * three を import しないことで game/ と同様に Vitest(node環境)で完全にテストできる。
 */

/** 2D の水平面位置(y は地面固定なので扱わない)。 */
export interface Vec2 {
  x: number
  z: number
}

/** 歩行可能範囲(矩形)。境界を含む(クランプは [min, max])。 */
export interface WalkBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** GDD §2 移動速度。走り無し。 */
export const WALK_SPEED = 3.0 // m/s

/**
 * 歩行可能範囲(GDD §2)。
 * - x: 参道幅8m → x∈[-4, 4]
 * - z: 入口側(手前)はカメラに収まる +6 を上限、奥は鳥居 z=-60 の手前 -57 を下限とし、
 *      鳥居の先へ出られない。
 */
export const WALK_BOUNDS: WalkBounds = {
  minX: -4,
  maxX: 4,
  minZ: -57,
  maxZ: 6,
}

/**
 * キーボード入力(押下フラグの集合)を -1..1 の移動ベクトルへ変換する。
 * 画面奥(-Z)が「前進」。左右同時押し等は相殺される。正規化はしない(対角線でも速くならないよう
 * integrate 側で正規化する)。
 */
export function keyboardMoveVector(input: {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
}): Vec2 {
  let x = 0
  let z = 0
  if (input.forward) z -= 1
  if (input.back) z += 1
  if (input.left) x -= 1
  if (input.right) x += 1
  return { x, z }
}

/**
 * 移動ベクトル(任意長)を walkSpeed・dt で積分し、新しい位置を返す(クランプ込み)。
 * dt ベースなのでフレームレート非依存。対角線移動でも速度が WALK_SPEED を超えないよう、
 * 入力方向は正規化してから speed を掛ける。入力が零ベクトルなら位置は変わらない。
 *
 * @param pos    現在位置(変更しない。新しいオブジェクトを返す)
 * @param move   移動方向(長さは無視し方向のみ使う)
 * @param dt     経過秒
 * @param speed  速度(m/s)。既定 WALK_SPEED
 * @param bounds クランプ範囲。既定 WALK_BOUNDS
 */
export function integrateMovement(
  pos: Vec2,
  move: Vec2,
  dt: number,
  speed: number = WALK_SPEED,
  bounds: WalkBounds = WALK_BOUNDS,
): Vec2 {
  const len = Math.hypot(move.x, move.z)
  if (len === 0 || dt <= 0) {
    return clampToBounds(pos, bounds)
  }
  const step = (speed * dt) / len
  return clampToBounds({ x: pos.x + move.x * step, z: pos.z + move.z * step }, bounds)
}

/** 位置を歩行可能範囲へクランプする(各軸を独立に [min, max] へ収める)。 */
export function clampToBounds(pos: Vec2, bounds: WalkBounds = WALK_BOUNDS): Vec2 {
  return {
    x: clamp(pos.x, bounds.minX, bounds.maxX),
    z: clamp(pos.z, bounds.minZ, bounds.maxZ),
  }
}

/**
 * マウスのみ前進(INTERACTION_SPEC §3.1)時の移動方向を求める。
 * 「現在の前進方向(画面奥 -Z)」を基準に、屋台方向ベクトルへ係数 convergence(0..1)だけ
 * 緩やかに収束させた単位ベクトルを返す。キーボードを使わずに屋台の近接圏へ入れることを保証する。
 *
 * convergence=0 ならまっすぐ前進(-Z)、convergence=1 なら完全に屋台方向。
 * 収束はマウス押下時のみ呼ぶ(キーボード移動とは干渉しない)。
 *
 * @param pos         現在位置
 * @param target      屋台位置
 * @param convergence 収束係数 0..1(1フレームぶんではなく定常の混合比)
 */
export function mouseForwardVector(pos: Vec2, target: Vec2, convergence: number): Vec2 {
  // 基準の前進方向(画面奥)。
  const forwardX = 0
  const forwardZ = -1

  // 屋台方向(正規化)。屋台にほぼ重なっている場合は前進方向のみ。
  const dx = target.x - pos.x
  const dz = target.z - pos.z
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-6) {
    return { x: forwardX, z: forwardZ }
  }
  const toTargetX = dx / dist
  const toTargetZ = dz / dist

  const c = clamp(convergence, 0, 1)
  const mixX = forwardX * (1 - c) + toTargetX * c
  const mixZ = forwardZ * (1 - c) + toTargetZ * c
  const mixLen = Math.hypot(mixX, mixZ)
  if (mixLen < 1e-6) {
    return { x: forwardX, z: forwardZ }
  }
  return { x: mixX / mixLen, z: mixZ / mixLen }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
