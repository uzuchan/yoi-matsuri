/**
 * 参道の雰囲気演出の純TSロジック(描画非依存・テスト可能)。T-009。
 *
 * - FireworksTimer: 花火の打ち上げタイミング(初回〜10s、以降 30〜45s 間隔)を管理する。
 *   乱数は world 内 helper で完結(再現可能・テスト可能。core/rng に依存しない)。
 * - FootstepCadence: 移動中 0.45s 間隔の足音発火タイミングを管理する(停止で鳴らさない)。
 * - walkBobOffset: 歩行ボブ(カメラ上下 ±0.03m)の純関数。
 *
 * いずれも three を import しないため Vitest(node環境)で完全にテストできる。
 */

import { jitter01 } from './palette'

// GDD §2 / ART §3 / T-009 AC1: 花火は 30〜45s 間隔。VS デモ視認性のため初回は早め(〜10s)。
export const FIREWORKS_FIRST_DELAY = 8 // s(初回。〜10s 以内)
export const FIREWORKS_INTERVAL_MIN = 30 // s
export const FIREWORKS_INTERVAL_MAX = 45 // s

/**
 * 花火の打ち上げタイマー。tick(dt) が「この更新で打ち上げるか」を返す。
 * 次の間隔は seed ベースの決定論的ジッタで 30〜45s に決める(打ち上げ毎に seed を進める)。
 */
export class FireworksTimer {
  /** 次の打ち上げまでの残り秒。 */
  private remaining: number
  /** 打ち上げ回数(seed として使う。決定論的)。 */
  private launchCount = 0
  /** 直近 tick が true を返したときの seed(launchOne へ渡す)。 */
  lastSeed = 0

  constructor(firstDelay: number = FIREWORKS_FIRST_DELAY) {
    this.remaining = firstDelay
  }

  /** 次の間隔(30〜45s)を打ち上げ回数から決定論的に算出する。 */
  private nextInterval(): number {
    const r = jitter01(this.launchCount, 91)
    return FIREWORKS_INTERVAL_MIN + r * (FIREWORKS_INTERVAL_MAX - FIREWORKS_INTERVAL_MIN)
  }

  /**
   * 経過 dt を進め、打ち上げタイミングに達したら true を返し次の間隔へリセットする。
   * 1回の tick で複数回打ち上げない(残りが負でも1回だけ true、超過ぶんは次へ繰り越さず吸収)。
   */
  tick(dt: number): boolean {
    this.remaining -= dt
    if (this.remaining > 0) return false
    const seed = this.launchCount
    this.launchCount += 1
    this.remaining = this.nextInterval()
    this.lastSeed = seed
    return true
  }

  /** 累計打ち上げ回数(テスト・デバッグ用)。 */
  get count(): number {
    return this.launchCount
  }
}

/** INTERACTION_SPEC §4: 足音は 0.45s 間隔。 */
export const FOOTSTEP_INTERVAL = 0.45 // s

/**
 * 足音の間隔タイマー。移動中のみ tick(dt, moving) が 0.45s ごとに true を返す。
 * 停止すると蓄積をリセットし、再び動き出したら最初の1歩を即座に鳴らす(踏み出しの手応え)。
 */
export class FootstepCadence {
  private accum = 0
  private wasMoving = false

  /**
   * @param dt     経過秒
   * @param moving 移動中か
   * @returns この更新で足音を鳴らすべきか
   */
  tick(dt: number, moving: boolean): boolean {
    if (!moving) {
      this.accum = 0
      this.wasMoving = false
      return false
    }
    // 停止 → 移動の踏み出しは即座に1歩。
    if (!this.wasMoving) {
      this.wasMoving = true
      this.accum = 0
      return true
    }
    this.accum += dt
    if (this.accum >= FOOTSTEP_INTERVAL) {
      // 超過ぶんを繰り越し(高 dt でも歩調が一定)。
      this.accum -= FOOTSTEP_INTERVAL
      return true
    }
    return false
  }
}

// INTERACTION_SPEC §3.1: 歩行ボブ = カメラ上下 ±0.03m。
export const WALK_BOB_AMPLITUDE = 0.03 // m
/** ボブの歩調(rad/s)。足音 0.45s/歩 = 上下動 2回/歩 とし、自然なリズムにする。 */
export const WALK_BOB_FREQUENCY = (Math.PI * 2) / FOOTSTEP_INTERVAL

/**
 * 歩行ボブのカメラ高さオフセット(m)を返す純関数。
 * 移動中は phase に応じて ±WALK_BOB_AMPLITUDE で上下し、停止中(intensity=0)は 0。
 *
 * @param phaseSec  ボブ位相の累積秒(移動中のみ進める)
 * @param intensity 0..1。移動中=1、停止で 0 へ減衰(呼び出し側が補間)
 */
export function walkBobOffset(phaseSec: number, intensity: number): number {
  const i = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity
  return Math.sin(phaseSec * WALK_BOB_FREQUENCY) * WALK_BOB_AMPLITUDE * i
}
