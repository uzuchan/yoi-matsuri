import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Points,
  PointsMaterial,
} from 'three'
import { jitter01 } from './palette'
import type { WorldObject } from './types'

/**
 * 花火(ART §3 / GDD §2 / AUDIO_SPEC §3)。
 *
 * - 1発 120〜200 粒。THREE.Points + 加算合成(AdditiveBlending)で夜空に映す(ライトを増やさない)。
 * - 3段階: 打ち上げ筋(launch)→ 開花(burst)→ 残光(afterglow)。
 * - 物理: 開花後は各粒が初速 + 重力落下 + 速度減衰、寿命は約 1.8s。
 * - 色は ART §2 の花火3色 #ff6b9d / #ffd166 / #4ecdc4 から選ぶ(加算合成前提)。
 * - タイミング: launch → 約 1.2s → burst を shell 内部で持つ(発火と音の同期の基準)。
 * - パフォーマンス: shell をプール再利用し、各 shell の位置バッファは構築時に確保した
 *   Float32Array を毎フレーム書き換える(フレーム毎の new を避ける)。
 *
 * 純TSの軌道・寿命計算(FireworkShell)を three 描画から分離し、unit test で固定する。
 */

/** ART §2 花火の基本3色(加算合成)。 */
export const FIREWORK_COLORS = ['#ff6b9d', '#ffd166', '#4ecdc4'] as const
export type FireworkColor = (typeof FIREWORK_COLORS)[number]

/** 1発の粒数の範囲(ART §3: 120〜200粒)。 */
export const PARTICLE_MIN = 120
export const PARTICLE_MAX = 200
/** バッファ確保の上限(粒数の最大値ぶんを確保し、shell ごとに使用数を変える)。 */
const PARTICLE_CAPACITY = PARTICLE_MAX

/** 同時に空に存在しうる shell の数(プールサイズ)。間隔30〜45sなら1で足りるが残光の重なりに備え2。 */
export const SHELL_POOL_SIZE = 2

/** launch から burst までの時間(s)。AUDIO_SPEC §3: 打ち上げから1.2s後に開花。 */
export const LAUNCH_TO_BURST = 1.2
/** 開花後の寿命(s)。ART §3: 寿命約1.8s。 */
export const BURST_LIFETIME = 1.8
/** 1発まるごとの総寿命(launch 筋 + 開花残光)。 */
export const SHELL_TOTAL_LIFETIME = LAUNCH_TO_BURST + BURST_LIFETIME

/** 重力加速度(m/s^2、下向き)。夜空スケールでゆったり落ちるよう実測値より弱める。 */
const GRAVITY = 4.2
/** 開花粒の速度減衰(空気抵抗、1秒あたりの指数減衰の時定数の逆数に相当)。 */
const DRAG = 1.6
/** 開花の広がり初速(m/s)。半径方向のばらつき(大きいほど広く開く)。 */
const BURST_SPEED_MIN = 4.0
const BURST_SPEED_MAX = 9.0
/** 打ち上げ筋の長さ(m、burst 位置から下へ伸びる尾)。 */
const TRAIL_LENGTH = 3.0

/** 3次元ベクトル(three 非依存のプレーン型。テスト・イベントペイロード用)。 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** shell の段階。 */
export type FireworkPhase = 'idle' | 'launch' | 'burst'

/**
 * 1発の花火の純TSシミュレーション(描画非依存・テスト可能)。
 * launch(直線上昇する尾)→ burst(放射状に飛散し重力落下+減衰する粒群)→ 残光の透明化。
 *
 * 粒の位置は preallocated な Float32Array(x,y,z×capacity)に書き込む。three を import しない。
 */
export class FireworkShell {
  /** 粒位置バッファ(x,y,z の連続。capacity ぶん確保。使用数は particleCount)。 */
  readonly positions: Float32Array

  private readonly capacity: number
  /** この発で実際に使う粒数(120〜200)。 */
  particleCount = 0
  phase: FireworkPhase = 'idle'
  /** 現在の段階内経過秒。 */
  private t = 0
  /** 全体の透明度(launch 尾・残光の一括フェード)。 */
  alpha = 0
  /** 開花点(world 座標)。launch 中はここへ向かって尾が上昇する。 */
  private burstX = 0
  private burstY = 0
  private burstZ = 0
  /** 打ち上げ筋の起点(地表寄り)。 */
  private launchX = 0
  private launchZ = 0
  /** 開花粒の初速(capacity ぶん。x,y,z 連続)。 */
  private readonly velocities: Float32Array
  /** この発の色。 */
  color: FireworkColor = FIREWORK_COLORS[0]
  /** burst へ移った瞬間を1度だけ通知するためのフラグ(director が拾う)。 */
  private burstNotified = false

  constructor(capacity = PARTICLE_CAPACITY) {
    this.capacity = capacity
    this.positions = new Float32Array(capacity * 3)
    this.velocities = new Float32Array(capacity * 3)
  }

  /** 空に出ていない(再利用可能)か。 */
  get isIdle(): boolean {
    return this.phase === 'idle'
  }

  /** 開花点(イベントペイロード用)。 */
  get burstPosition(): Vec3 {
    return { x: this.burstX, y: this.burstY, z: this.burstZ }
  }

  /**
   * 1発を起動する。burst 位置(開花点)・色・シードを与えると、launch 段から始まる。
   * 粒数・初速は seed から決定論的に決める(再現可能・テスト可能)。
   */
  launch(burst: Vec3, color: FireworkColor, seed: number): void {
    this.phase = 'launch'
    this.t = 0
    this.alpha = 1
    this.burstNotified = false
    this.burstX = burst.x
    this.burstY = burst.y
    this.burstZ = burst.z
    this.launchX = burst.x
    this.launchZ = burst.z
    this.color = color

    const count = Math.round(
      PARTICLE_MIN + jitter01(seed, 1) * (PARTICLE_MAX - PARTICLE_MIN),
    )
    this.particleCount = Math.min(count, this.capacity)

    // 開花粒の初速を球面上に散らす(決定論的)。burst になった瞬間にこの初速で飛び出す。
    for (let i = 0; i < this.particleCount; i++) {
      // 球面一様サンプリング(seed × index)。
      const u = jitter01(seed * 7 + i, 2) * 2 - 1 // cosθ ∈ [-1,1]
      const phi = jitter01(seed * 13 + i, 3) * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const speed = BURST_SPEED_MIN + jitter01(seed * 17 + i, 4) * (BURST_SPEED_MAX - BURST_SPEED_MIN)
      const vi = i * 3
      this.velocities[vi] = r * Math.cos(phi) * speed
      this.velocities[vi + 1] = u * speed
      this.velocities[vi + 2] = r * Math.sin(phi) * speed
    }

    // 初期位置は launch 尾(burst 点の下から burst 点まで)に並べる。
    this.writeLaunchTrail(0)
  }

  /**
   * 進行する。戻り値は「この update で burst へ遷移したか」(director が fireworks:burst を発火する基準)。
   */
  update(dt: number): boolean {
    if (this.phase === 'idle') return false
    this.t += dt
    let justBurst = false

    if (this.phase === 'launch') {
      const k = Math.min(this.t / LAUNCH_TO_BURST, 1)
      this.writeLaunchTrail(k)
      if (this.t >= LAUNCH_TO_BURST) {
        this.phase = 'burst'
        this.t = 0
        justBurst = !this.burstNotified
        this.burstNotified = true
      }
    } else if (this.phase === 'burst') {
      this.writeBurst(this.t)
      if (this.t >= BURST_LIFETIME) {
        this.phase = 'idle'
        this.alpha = 0
        this.particleCount = 0
      }
    }
    return justBurst
  }

  /**
   * launch 段の尾を書き込む。k=0 で尾の先頭が launch 起点付近、k=1 で burst 点へ到達。
   * 全粒を burst 点直下の細い尾に集め、上昇していく筋に見せる。
   */
  private writeLaunchTrail(k: number): void {
    // 尾の先端の高さ(burst 点まで上昇)。
    const headY = this.burstY - TRAIL_LENGTH * (1 - k)
    for (let i = 0; i < this.particleCount; i++) {
      // 各粒を尾に沿って分布(先端 headY から下へ少し)。
      const f = i / Math.max(this.particleCount - 1, 1)
      const pi = i * 3
      this.positions[pi] = this.launchX
      this.positions[pi + 1] = headY - f * TRAIL_LENGTH * 0.5
      this.positions[pi + 2] = this.launchZ
    }
  }

  /**
   * burst 段の粒位置を書き込む。各粒 = burst点 + v0·decay(t) + 重力落下。
   * 速度は指数減衰(空気抵抗)。残光は寿命末で透明化。
   *
   * 解析的に: 減衰係数 e^{-DRAG·t} を用い、変位 = v0·(1-e^{-DRAG·t})/DRAG。
   * 重力は別途 -0.5·g·t^2(垂直方向のみ)を加える。
   */
  private writeBurst(t: number): void {
    const decayDisp = (1 - Math.exp(-DRAG * t)) / DRAG
    const gravityDrop = 0.5 * GRAVITY * t * t
    // 残光フェード: 寿命の前半は明るさ頂点(ただし加算合成の白飽和を避けるため 1 未満に抑える)、
    // 後半で滑らかに 0 へ。
    const PEAK = 0.85
    const lifeK = t / BURST_LIFETIME
    const fade = lifeK < 0.45 ? PEAK : PEAK * (1 - (lifeK - 0.45) / 0.55)
    this.alpha = Math.max(0, fade)
    for (let i = 0; i < this.particleCount; i++) {
      const vi = i * 3
      const pi = i * 3
      this.positions[pi] = this.burstX + this.velocities[vi] * decayDisp
      this.positions[pi + 1] = this.burstY + this.velocities[vi + 1] * decayDisp - gravityDrop
      this.positions[pi + 2] = this.burstZ + this.velocities[vi + 2] * decayDisp
    }
  }
}

/** 花火 director のコールバック(approach が EventBus へ橋渡しする)。 */
export interface FireworksCallbacks {
  /** 打ち上げ時(launch 開始)。color と burst 予定位置を渡す。 */
  onLaunch?(color: FireworkColor, position: Vec3): void
  /** 開花時(launch から約 LAUNCH_TO_BURST 秒後)。color と開花位置を渡す。 */
  onBurst?(color: FireworkColor, position: Vec3): void
}

/** createFireworks の戻り値。WorldObject に launchOne(打ち上げトリガ)を足したもの。 */
export interface FireworksObject extends WorldObject {
  /**
   * 1発打ち上げる。空き shell があれば起動し、その color と burst 予定位置を返す。
   * 空きが無ければ null(プール枯渇時はスキップ = 過剰生成しない)。
   */
  launchOne(seed: number): { color: FireworkColor; position: Vec3 } | null
}

/** 開花点の生成範囲(world 座標)。参道上空・鳥居側の夜空に散らす。 */
export interface FireworksBurstArea {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

// 開花点は鳥居の向こうの夜空に散らす。approach カメラ(高さ3.2m・俯角15°・FOV55°)で
// 上空が見える帯は限られるため、高さは 10〜14m に収め(鳥居 y=8 の上)、奥(-Z)へ置いて
// 画面上部の夜空で開花が見えるようにする(視認性。ART §3「夜空」)。
const DEFAULT_BURST_AREA: FireworksBurstArea = {
  minX: -10,
  maxX: 10,
  minY: 10,
  maxY: 14,
  minZ: -52,
  maxZ: -42,
}

/** seed から決定論的に開花点と色を選ぶ(再現可能・テスト可能)。 */
export function pickBurst(
  seed: number,
  area: FireworksBurstArea = DEFAULT_BURST_AREA,
): { position: Vec3; color: FireworkColor } {
  const x = area.minX + jitter01(seed, 31) * (area.maxX - area.minX)
  const y = area.minY + jitter01(seed, 32) * (area.maxY - area.minY)
  const z = area.minZ + jitter01(seed, 33) * (area.maxZ - area.minZ)
  const ci = Math.floor(jitter01(seed, 34) * FIREWORK_COLORS.length) % FIREWORK_COLORS.length
  return { position: { x, y, z }, color: FIREWORK_COLORS[ci] }
}

/**
 * 花火の WorldObject を構築する。shell プール × THREE.Points(加算合成)。
 * approach が launchOne(seed) でタイミングを制御し、callbacks で launch/burst を EventBus へ橋渡しする。
 */
export function createFireworks(
  callbacks: FireworksCallbacks = {},
  area: FireworksBurstArea = DEFAULT_BURST_AREA,
): FireworksObject {
  const group = new Group()
  group.name = 'fireworks'

  interface ShellRender {
    shell: FireworkShell
    geometry: BufferGeometry
    material: PointsMaterial
    points: Points
    positionAttr: BufferAttribute
  }

  const renders: ShellRender[] = []
  for (let s = 0; s < SHELL_POOL_SIZE; s++) {
    const shell = new FireworkShell()
    const geometry = new BufferGeometry()
    // shell.positions を共有(BufferAttribute は TypedArray をコピーせず参照する。
    // Float32BufferAttribute はコピーしてしまうので使わない)。draw range で使用数を絞る。
    const positionAttr = new BufferAttribute(shell.positions, 3)
    positionAttr.setUsage(DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setDrawRange(0, 0)
    const material = new PointsMaterial({
      // 粒は小さめに保ち、加算合成での重なりが白飽和しないようにする(色を読ませる)。
      // 遠方(z≈-42〜-52m)でも個々の火花が散って見える程度。
      size: 0.45,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      opacity: 0,
      color: new Color(FIREWORK_COLORS[0]),
    })
    const points = new Points(geometry, material)
    points.name = `firework-shell-${s}`
    points.frustumCulled = false
    points.visible = false
    group.add(points)
    renders.push({ shell, geometry, material, points, positionAttr })
  }

  return {
    object: group,

    launchOne(seed: number): { color: FireworkColor; position: Vec3 } | null {
      const free = renders.find((r) => r.shell.isIdle)
      if (!free) return null
      const { position, color } = pickBurst(seed, area)
      free.shell.launch(position, color, seed)
      free.material.color.set(color)
      free.points.visible = true
      callbacks.onLaunch?.(color, position)
      return { color, position }
    },

    update(dt: number): void {
      for (const r of renders) {
        if (r.shell.isIdle) {
          if (r.points.visible) r.points.visible = false
          continue
        }
        const justBurst = r.shell.update(dt)
        if (justBurst) {
          callbacks.onBurst?.(r.shell.color, r.shell.burstPosition)
        }
        // 位置バッファは shell が書き換え済み。GPU へ反映。
        r.positionAttr.needsUpdate = true
        r.geometry.setDrawRange(0, r.shell.particleCount)
        r.material.opacity = r.shell.alpha
        if (r.shell.isIdle) {
          r.points.visible = false
        }
      }
    },

    dispose(): void {
      for (const r of renders) {
        group.remove(r.points)
        r.geometry.dispose()
        r.material.dispose()
      }
      renders.length = 0
    },
  }
}
