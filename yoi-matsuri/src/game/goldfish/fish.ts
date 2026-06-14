/**
 * 金魚 AI(GDD §4.5)。three / react / DOM 非依存の純TS。
 *
 *  - 通常(wander): ランダム目標点へ fishCruiseSpeed で泳ぐ。水槽(楕円)境界で滑らかに転回する。
 *  - 逃避(flee): 水中のポイが fishEscapeRadius 内に来ると、ポイと逆方向へ fishFleeSpeed で
 *                FISH_FLEE_DURATION(0.8s)逃げる。
 *  - 乱数は注入された SeededRandom(決定論的・再現可能)。AC5 / Risk(2)。
 *
 * 金魚のライフサイクル(session が遷移を駆動):
 *  - 'swimming': 水槽内を泳いでいる(AI が動かす)
 *  - 'onPoi':    すくわれてポイに乗っている(ポイ位置へ追従。session が位置を与える)
 *  - 'secured':  お椀へ確保済み(以後 AI 対象外)
 */
import { FISH_FLEE_DURATION, type GoldfishParams, type TankBounds } from './params'
import type { Vec2 } from './poi'
import type { SeededRandom } from './rng'

/** 金魚の状態。 */
export type FishStatus = 'swimming' | 'onPoi' | 'secured'

/** 金魚の公開状態スナップショット(T-006 描画が読む)。 */
export interface FishState {
  /** 安定した識別子(描画の対応付け用)。 */
  readonly id: number
  /** 水平位置 [m]。 */
  readonly position: Vec2
  /** 進行方向の単位ベクトル(向き描画用)。停止時は直前の向きを保つ。 */
  readonly heading: Vec2
  /** 現在状態。 */
  readonly status: FishStatus
  /** 逃避中か(描画の演出用)。 */
  readonly fleeing: boolean
}

/**
 * 1 匹の金魚。session の update から個別に駆動される。
 */
export class Fish {
  readonly id: number
  private readonly params: GoldfishParams
  private readonly bounds: TankBounds
  private readonly rng: SeededRandom

  private readonly pos: Vec2
  private readonly heading: Vec2
  private readonly wanderTarget: Vec2
  private status: FishStatus = 'swimming'

  /** 逃避の残り時間 [s](0 なら通常 wander)。 */
  private fleeTimer = 0
  /** 逃避方向(逃避開始時にポイと逆向きで固定)。 */
  private readonly fleeDir: Vec2 = { x: 0, z: 0 }

  constructor(
    id: number,
    params: GoldfishParams,
    bounds: TankBounds,
    rng: SeededRandom,
    start: Vec2,
  ) {
    this.id = id
    this.params = params
    this.bounds = bounds
    this.rng = rng
    this.pos = { x: start.x, z: start.z }
    this.heading = { x: 1, z: 0 }
    this.wanderTarget = this.pickWanderTarget()
  }

  /**
   * AI を 1 ステップ進める。
   * @param dt        ステップ時間 [s]
   * @param poiPos    ポイの水平位置 [m]
   * @param poiSubmerged ポイが水中か(水中のときのみ逃避判定)
   */
  update(dt: number, poiPos: Vec2, poiSubmerged: boolean): void {
    if (this.status !== 'swimming') return
    if (dt <= 0) return

    // 1) 逃避トリガ: 水中のポイが fishEscapeRadius 内なら逃避開始/更新。
    const toPoiX = poiPos.x - this.pos.x
    const toPoiZ = poiPos.z - this.pos.z
    const distToPoi = Math.hypot(toPoiX, toPoiZ)
    if (poiSubmerged && distToPoi <= this.params.fishEscapeRadius) {
      this.fleeTimer = FISH_FLEE_DURATION
      // ポイと逆方向。ポイ直上(距離≈0)の場合は乱数で散らす(決定論的)。
      if (distToPoi > 1e-6) {
        this.fleeDir.x = -toPoiX / distToPoi
        this.fleeDir.z = -toPoiZ / distToPoi
      } else {
        const a = this.rng.range(0, Math.PI * 2)
        this.fleeDir.x = Math.cos(a)
        this.fleeDir.z = Math.sin(a)
      }
    }

    // 2) 移動方向と速度を決める。
    let dirX: number
    let dirZ: number
    let speed: number
    if (this.fleeTimer > 0) {
      this.fleeTimer = Math.max(0, this.fleeTimer - dt)
      dirX = this.fleeDir.x
      dirZ = this.fleeDir.z
      speed = this.params.fishFleeSpeed
    } else {
      // wander: 目標へ向かう。到達したら次の目標を選ぶ。
      const tx = this.wanderTarget.x - this.pos.x
      const tz = this.wanderTarget.z - this.pos.z
      const td = Math.hypot(tx, tz)
      if (td < 0.03) {
        const next = this.pickWanderTarget()
        this.wanderTarget.x = next.x
        this.wanderTarget.z = next.z
      }
      const ndx = this.wanderTarget.x - this.pos.x
      const ndz = this.wanderTarget.z - this.pos.z
      const nd = Math.hypot(ndx, ndz)
      if (nd > 1e-6) {
        dirX = ndx / nd
        dirZ = ndz / nd
      } else {
        dirX = this.heading.x
        dirZ = this.heading.z
      }
      speed = this.params.fishCruiseSpeed
    }

    // 3) 進める。
    let nextX = this.pos.x + dirX * speed * dt
    let nextZ = this.pos.z + dirZ * speed * dt

    // 4) 楕円境界で滑らかに転回。境界外へ出そうなら法線で反射し、新しい wander 目標を内側へ取り直す。
    const reflected = this.reflectAtBoundary(nextX, nextZ, dirX, dirZ)
    nextX = reflected.x
    nextZ = reflected.z
    if (reflected.bounced) {
      // 反射時は逃避方向も内向きに更新し、wander 目標を新規取得して境界沿いに張り付かない。
      if (this.fleeTimer > 0) {
        this.fleeDir.x = reflected.dirX
        this.fleeDir.z = reflected.dirZ
      } else {
        const t = this.pickWanderTarget()
        this.wanderTarget.x = t.x
        this.wanderTarget.z = t.z
      }
      dirX = reflected.dirX
      dirZ = reflected.dirZ
    }

    this.pos.x = nextX
    this.pos.z = nextZ
    if (Math.hypot(dirX, dirZ) > 1e-6) {
      this.heading.x = dirX
      this.heading.z = dirZ
    }
  }

  /**
   * 楕円境界(x²/rx² + z²/rz² = 1)での滑らかな転回。
   * 次位置が境界外なら、境界の外向き法線に対して速度ベクトルを反射し、内側へ向き直す。
   */
  private reflectAtBoundary(
    nx: number,
    nz: number,
    dirX: number,
    dirZ: number,
  ): { x: number; z: number; dirX: number; dirZ: number; bounced: boolean } {
    const rx = this.bounds.radiusX
    const rz = this.bounds.radiusZ
    const norm = (nx * nx) / (rx * rx) + (nz * nz) / (rz * rz)
    if (norm <= 1) {
      return { x: nx, z: nz, dirX, dirZ, bounced: false }
    }
    // 楕円の外向き法線 ∝ (x/rx², z/rz²)。これを単位化して反射に使う。
    let gnx = nx / (rx * rx)
    let gnz = nz / (rz * rz)
    const gl = Math.hypot(gnx, gnz)
    if (gl < 1e-9) {
      // 退化(中心)。内向きにそのまま戻す。
      return { x: nx, z: nz, dirX: -dirX, dirZ: -dirZ, bounced: true }
    }
    gnx /= gl
    gnz /= gl
    // 反射: d' = d - 2(d·n)n。
    const dot = dirX * gnx + dirZ * gnz
    const rdx = dirX - 2 * dot * gnx
    const rdz = dirZ - 2 * dot * gnz
    // 位置は境界内側へ引き戻す(楕円面へスケールバック)。
    const scale = 1 / Math.sqrt(norm)
    // わずかに内側(0.98)へ寄せて境界張り付きを防ぐ。
    const cx = nx * scale * 0.98
    const cz = nz * scale * 0.98
    return { x: cx, z: cz, dirX: rdx, dirZ: rdz, bounced: true }
  }

  /** 楕円内のランダムな点を wander 目標として選ぶ(決定論的)。 */
  private pickWanderTarget(): Vec2 {
    // 単位円内の一様サンプリング → 楕円へスケール(中心寄りに偏らせ境界張り付きを避ける係数 0.85)。
    const a = this.rng.range(0, Math.PI * 2)
    const r = Math.sqrt(this.rng.next()) * 0.85
    return {
      x: Math.cos(a) * r * this.bounds.radiusX,
      z: Math.sin(a) * r * this.bounds.radiusZ,
    }
  }

  // --- session が駆動するライフサイクル ---

  /** ポイへ乗せる(捕獲)。以後 AI は止まり、位置は session が与える。 */
  setOnPoi(): void {
    this.status = 'onPoi'
    this.fleeTimer = 0
  }

  /** 水槽へ戻す(捕獲失敗・破損時の戻し)。現在位置から再び泳ぎ出す。 */
  returnToTank(): void {
    this.status = 'swimming'
    this.fleeTimer = 0
    const t = this.pickWanderTarget()
    this.wanderTarget.x = t.x
    this.wanderTarget.z = t.z
  }

  /** お椀へ確保(以後 AI 対象外)。 */
  setSecured(): void {
    this.status = 'secured'
    this.fleeTimer = 0
  }

  /** onPoi のとき、ポイ位置へ位置を合わせる(session が呼ぶ)。 */
  followPoi(pos: Vec2): void {
    this.pos.x = pos.x
    this.pos.z = pos.z
  }

  get currentStatus(): FishStatus {
    return this.status
  }

  get isFleeing(): boolean {
    return this.fleeTimer > 0
  }

  get position(): Vec2 {
    return { x: this.pos.x, z: this.pos.z }
  }

  /** ポイ中心からの距離 [m]。捕獲判定に使う。 */
  distanceTo(pos: Vec2): number {
    return Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z)
  }

  /** 公開状態スナップショット(T-006 描画が読む)。 */
  snapshot(): FishState {
    return {
      id: this.id,
      position: { x: this.pos.x, z: this.pos.z },
      heading: { x: this.heading.x, z: this.heading.z },
      status: this.status,
      fleeing: this.fleeTimer > 0,
    }
  }
}
