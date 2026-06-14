/**
 * スーパーボールの挙動(MINIGAME_ARCHETYPES 原型A #1)。three / react / DOM 非依存の純TS(D-003)。
 *
 * 金魚(game/goldfish/fish.ts)との対比:
 *  - **逃げない**。ポイが近づいても回避しない。AI は単純な drift(ゆっくり漂う)+ bob(上下の弾み)。
 *  - 水面に浮かんで「ゆらゆら漂う」(§2 #1)。方向は driftTurnInterval ごとに決定論的に変える。
 *  - 楕円水槽の境界で跳ね返る(壁で向きを反転)。
 *
 * 乱数は SeededRandom(金魚と同じ rng)で決定論化し、テスト可能にする(§7 厳守: 乱数は seeded)。
 */
import { SeededRandom, type TankBounds, type Vec2 } from '../goldfish'
import type { SuperballParams } from './params'

/** ボールの状態。'floating'=水面で漂う / 'onPoi'=ポイに乗っている / 'secured'=お椀へ確保済み。 */
export type BallStatus = 'floating' | 'onPoi' | 'secured'

/** ボールの公開状態スナップショット(シーン描画が読む)。 */
export interface BallState {
  readonly id: number
  /** 水平位置 [m](水面 2D)。 */
  readonly position: Vec2
  /** 弾み(bob)の位相 [rad](描画の上下ゆらぎ用)。 */
  readonly bobPhase: number
  /** 色 index(SUPERBALL_COLORS への参照。描画用)。 */
  readonly colorIndex: number
  readonly status: BallStatus
}

/**
 * スーパーボール 1 個。session から update され、状態を公開する。
 * 楕円水槽内をゆっくり漂い(drift)、上下に弾む(bob)。逃げない。
 */
export class Ball {
  readonly id: number
  readonly colorIndex: number
  private readonly params: SuperballParams
  private readonly bounds: TankBounds
  private readonly rng: SeededRandom

  private readonly pos: Vec2
  /** 漂いの進行方向(単位ベクトル)。 */
  private dir: Vec2
  /** 次に方向転換するまでの残り時間 [s]。 */
  private turnTimer: number
  /** bob の位相 [rad]。 */
  private bobPhase: number
  private status: BallStatus = 'floating'

  constructor(
    id: number,
    colorIndex: number,
    params: SuperballParams,
    bounds: TankBounds,
    rng: SeededRandom,
    start: Vec2,
  ) {
    this.id = id
    this.colorIndex = colorIndex
    this.params = params
    this.bounds = bounds
    this.rng = rng
    this.pos = { x: start.x, z: start.z }
    const a = rng.range(0, Math.PI * 2)
    this.dir = { x: Math.cos(a), z: Math.sin(a) }
    this.turnTimer = rng.range(0, params.driftTurnInterval)
    this.bobPhase = rng.range(0, Math.PI * 2)
  }

  get currentStatus(): BallStatus {
    return this.status
  }

  get position(): Vec2 {
    return { x: this.pos.x, z: this.pos.z }
  }

  /** ポイ位置との距離 [m]。 */
  distanceTo(point: Vec2): number {
    return Math.hypot(this.pos.x - point.x, this.pos.z - point.z)
  }

  /** ポイへ乗せる(捕獲成立時)。 */
  setOnPoi(): void {
    this.status = 'onPoi'
  }

  /** お椀へ確保する。 */
  setSecured(): void {
    this.status = 'secured'
  }

  /** 水面へ戻す(確保失敗=こぼれ時)。漂いを再開する。 */
  returnToTank(): void {
    if (this.status === 'secured') return
    this.status = 'floating'
  }

  /** ポイ位置へ追従させる(onPoi のときに session が呼ぶ)。 */
  followPoi(poiPos: Vec2): void {
    if (this.status !== 'onPoi') return
    this.pos.x = poiPos.x
    this.pos.z = poiPos.z
  }

  /**
   * 1 ステップ進める(漂い + 弾み)。onPoi / secured のときは漂わない(乗っている/確保済み)。
   * 逃げない(ポイの位置・水中状態は受け取らない = 金魚との決定的な差)。
   */
  update(dt: number): void {
    // bob は常に進める(乗っていても確保済みでも見た目の弾みは残ってよいが、確保後は描画されない)。
    this.bobPhase = (this.bobPhase + this.params.bobSpeed * dt) % (Math.PI * 2)
    if (this.status !== 'floating') return

    // 方向転換タイマー(ゆらゆら漂う: 一定間隔で向きを少しずつ変える)。
    this.turnTimer -= dt
    if (this.turnTimer <= 0) {
      this.turnTimer += this.params.driftTurnInterval
      // 現在の進行方向から ±60° 程度ゆらす(急旋回しない=ゆらゆら感)。
      const cur = Math.atan2(this.dir.z, this.dir.x)
      const next = cur + this.rng.range(-Math.PI / 3, Math.PI / 3)
      this.dir = { x: Math.cos(next), z: Math.sin(next) }
    }

    // 漂い移動。
    this.pos.x += this.dir.x * this.params.driftSpeed * dt
    this.pos.z += this.dir.z * this.params.driftSpeed * dt

    // 楕円水槽の境界で跳ね返す(正規化距離 >= 1 で内向きへ反射)。
    this.reflectAtBounds()
  }

  /**
   * 楕円水槽の縁でボールを内側へ跳ね返す。楕円 (x/rx)²+(z/rz)²>=1 を越えたら、
   * 楕円の外向き法線方向の速度成分を反転し、位置を縁内へ引き戻す。
   */
  private reflectAtBounds(): void {
    const rx = this.bounds.radiusX * 0.92 // 縁の少し内側を実効境界に(ボール半径ぶん)
    const rz = this.bounds.radiusZ * 0.92
    const nx = this.pos.x / rx
    const nz = this.pos.z / rz
    const r2 = nx * nx + nz * nz
    if (r2 < 1) return
    // 楕円の外向き法線(勾配方向)。
    let gx = nx / rx
    let gz = nz / rz
    const glen = Math.hypot(gx, gz) || 1
    gx /= glen
    gz /= glen
    // 速度を法線方向に反射(v' = v - 2(v·n)n)。
    const dot = this.dir.x * gx + this.dir.z * gz
    this.dir = { x: this.dir.x - 2 * dot * gx, z: this.dir.z - 2 * dot * gz }
    const dlen = Math.hypot(this.dir.x, this.dir.z) || 1
    this.dir = { x: this.dir.x / dlen, z: this.dir.z / dlen }
    // 位置を境界上(わずかに内側)へクランプして抜けを防ぐ。
    const scale = 0.999 / Math.sqrt(r2)
    this.pos.x *= scale
    this.pos.z *= scale
  }

  /** 公開状態スナップショット。 */
  snapshot(): BallState {
    return {
      id: this.id,
      position: { x: this.pos.x, z: this.pos.z },
      bobPhase: this.bobPhase,
      colorIndex: this.colorIndex,
      status: this.status,
    }
  }
}
