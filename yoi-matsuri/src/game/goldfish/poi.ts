/**
 * ポイ(すくい網)の物理と紙耐久(GDD §4.2 / §4.3 / §4.4)。
 *
 * three / react / DOM 非依存の純TS(D-003)。dt ベースでフレームレート非依存。
 *
 * 物理モデル:
 *  - カーソル目標位置への慣性追従を「時定数 tau の指数平滑」で実装する。
 *    連続時間の一次遅れ x' = (target - x)/tau を、各ステップで
 *    alpha = 1 - exp(-dt/tau) として x += (target - x)*alpha と離散化する。
 *    これにより dt を変えても同じ目標へ同じ時間で収束する(フレームレート非依存)。
 *  - 空中の時定数 = poiFollowLag、水中 = poiFollowLag × waterDragFactor(水の抵抗で鈍くなる)。
 *  - 水平速度 speed[m/s] = (このステップの移動距離) / dt。耐久ダメージの speed² 項に使う。
 *
 * 耐久(GDD §4.3):
 *  - 水中滞在: wetDamagePerSec [pt/s]
 *  - 水中移動: speedDamageCoeff × speed² [pt/s](次元: (m/s)² × pt·s²/m² = pt/s)
 *  - 金魚を載せて持ち上げた瞬間: fishWeightDamage [pt](session が applyFishWeightDamage で適用)
 *  - 耐久 0 で torn(本クラスは耐久値を保持するのみ。終了判定は session)
 */
import type { GoldfishParams } from './params'

/** 2D 水平座標 [m](x, z)。 */
export interface Vec2 {
  x: number
  z: number
}

/** ポイの公開状態スナップショット(T-006 描画 / HUD が読む)。 */
export interface PoiState {
  /** 水平位置 [m]。 */
  readonly position: Vec2
  /** 沈んでいるか(true=水中)。 */
  readonly submerged: boolean
  /** 現在の水中深さ [m](0=水面、submerge 時は dipDepth)。 */
  readonly depth: number
  /** 直近ステップの水平速度 [m/s]。 */
  readonly speed: number
  /** 紙の残り耐久 [pt]。 */
  readonly durability: number
  /** 耐久の比率 [0..1](HUD ゲージ・紙の劣化見た目用)。 */
  readonly durabilityRatio: number
}

/**
 * ポイの物理本体。session から update され、状態を公開する。
 */
export class Poi {
  private readonly params: GoldfishParams

  private readonly pos: Vec2
  private readonly target: Vec2
  private submerged = false
  private depth = 0
  private speed = 0
  private durability: number

  constructor(params: GoldfishParams, start: Vec2 = { x: 0, z: 0 }) {
    this.params = params
    this.pos = { x: start.x, z: start.z }
    this.target = { x: start.x, z: start.z }
    this.durability = params.paperDurability
  }

  /** 追従目標(カーソル位置)を設定する。 */
  setTarget(target: Vec2): void {
    this.target.x = target.x
    this.target.z = target.z
  }

  /** 沈める/持ち上げる状態を設定する。深さは次の update で dipDepth へ向けて即時反映する。 */
  setSubmerged(submerged: boolean): void {
    this.submerged = submerged
  }

  /**
   * 物理を 1 ステップ進める。
   * @returns このステップで受けた耐久ダメージ [pt](session の警告/破損判定の参考)。
   */
  update(dt: number): number {
    if (dt <= 0) {
      this.speed = 0
      return 0
    }

    // 1) 慣性追従(時定数 tau の指数平滑)。水中は waterDragFactor 倍だけ鈍い。
    const tau = this.submerged
      ? this.params.poiFollowLag * this.params.waterDragFactor
      : this.params.poiFollowLag
    const alpha = tau > 0 ? 1 - Math.exp(-dt / tau) : 1

    const prevX = this.pos.x
    const prevZ = this.pos.z
    this.pos.x += (this.target.x - this.pos.x) * alpha
    this.pos.z += (this.target.z - this.pos.z) * alpha

    // 2) 水平速度 [m/s]。
    const dx = this.pos.x - prevX
    const dz = this.pos.z - prevZ
    const moved = Math.hypot(dx, dz)
    this.speed = moved / dt

    // 3) 深さ(submerge=dipDepth へ、lift=0 へ即時)。描画/逃避判定が読む。
    this.depth = this.submerged ? this.params.dipDepth : 0

    // 4) 耐久ダメージ(水中のみ)。speed² 項で「速く動かすと一気に破れる」が成立する。
    let damage = 0
    if (this.submerged) {
      const wet = this.params.wetDamagePerSec * dt
      const motion = this.params.speedDamageCoeff * this.speed * this.speed * dt
      damage = wet + motion
      this.applyDamage(damage)
    }
    return damage
  }

  /**
   * 金魚を載せて持ち上げた瞬間の固定ダメージ(GDD §4.3 fishWeightDamage)。
   * @returns 実際に減った耐久 [pt]。
   */
  applyFishWeightDamage(): number {
    const before = this.durability
    this.applyDamage(this.params.fishWeightDamage)
    return before - this.durability
  }

  /** 耐久を減らす(0 でクランプ)。 */
  private applyDamage(amount: number): void {
    this.durability = Math.max(0, this.durability - amount)
  }

  /** 紙が破れたか(耐久 0)。 */
  get isTorn(): boolean {
    return this.durability <= 0
  }

  get position(): Vec2 {
    return { x: this.pos.x, z: this.pos.z }
  }

  get isSubmerged(): boolean {
    return this.submerged
  }

  get currentDepth(): number {
    return this.depth
  }

  get horizontalSpeed(): number {
    return this.speed
  }

  get remainingDurability(): number {
    return this.durability
  }

  /** 公開状態スナップショット(T-006 が描画・HUD に使う)。 */
  snapshot(): PoiState {
    return {
      position: { x: this.pos.x, z: this.pos.z },
      submerged: this.submerged,
      depth: this.depth,
      speed: this.speed,
      durability: this.durability,
      durabilityRatio: this.params.paperDurability > 0 ? this.durability / this.params.paperDurability : 0,
    }
  }
}
