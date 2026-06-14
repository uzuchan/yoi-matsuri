import { describe, expect, it } from 'vitest'
import {
  FireworksTimer,
  FootstepCadence,
  walkBobOffset,
  FIREWORKS_FIRST_DELAY,
  FIREWORKS_INTERVAL_MIN,
  FIREWORKS_INTERVAL_MAX,
  FOOTSTEP_INTERVAL,
  WALK_BOB_AMPLITUDE,
} from '../../src/world/atmosphere'

describe('FireworksTimer(初回〜10s、以降30〜45s間隔。GDD §2 / AC1)', () => {
  it('初回は FIREWORKS_FIRST_DELAY(〜10s 以内)で打ち上がる', () => {
    expect(FIREWORKS_FIRST_DELAY).toBeLessThanOrEqual(10)
    const t = new FireworksTimer()
    // 初回 delay の直前では打ち上がらない。
    expect(t.tick(FIREWORKS_FIRST_DELAY - 0.1)).toBe(false)
    // 越えたら打ち上がる。
    expect(t.tick(0.2)).toBe(true)
    expect(t.count).toBe(1)
  })

  it('2発目以降の間隔は 30〜45s に収まる', () => {
    const t = new FireworksTimer()
    // 初回を消化。
    t.tick(FIREWORKS_FIRST_DELAY)
    // 次の打ち上げまで小刻みに進めて間隔を計測。
    let elapsed = 0
    const dt = 0.5
    while (!t.tick(dt)) {
      elapsed += dt
      if (elapsed > 100) break // 安全弁
    }
    elapsed += dt
    expect(elapsed).toBeGreaterThanOrEqual(FIREWORKS_INTERVAL_MIN - 1)
    expect(elapsed).toBeLessThanOrEqual(FIREWORKS_INTERVAL_MAX + 1)
  })

  it('1回の tick で複数回は打ち上げない(大 dt でも1発)', () => {
    const t = new FireworksTimer()
    expect(t.tick(1000)).toBe(true)
    expect(t.count).toBe(1)
  })

  it('lastSeed は打ち上げごとに進み、間隔は決定論的(再現可能)', () => {
    const a = new FireworksTimer()
    const b = new FireworksTimer()
    const seedsA: number[] = []
    const seedsB: number[] = []
    for (let i = 0; i < 5; i++) {
      if (a.tick(60)) seedsA.push(a.lastSeed)
      if (b.tick(60)) seedsB.push(b.lastSeed)
    }
    expect(seedsA).toEqual(seedsB)
    expect(seedsA).toEqual([0, 1, 2, 3, 4])
  })
})

describe('FootstepCadence(移動中0.45s間隔。INTERACTION_SPEC §4 / AC4)', () => {
  it('FOOTSTEP_INTERVAL は 0.45s', () => {
    expect(FOOTSTEP_INTERVAL).toBeCloseTo(0.45, 6)
  })

  it('停止中は鳴らさない', () => {
    const c = new FootstepCadence()
    for (let i = 0; i < 10; i++) {
      expect(c.tick(0.1, false)).toBe(false)
    }
  })

  it('移動の踏み出しで即1歩、以降0.45sごとに鳴る', () => {
    const c = new FootstepCadence()
    // 踏み出し(stop → move)で即1歩。
    expect(c.tick(0.016, true)).toBe(true)
    // 0.45s 未満では鳴らない。
    let acc = 0
    let steps = 0
    const dt = 0.05
    while (acc < FOOTSTEP_INTERVAL - dt) {
      if (c.tick(dt, true)) steps++
      acc += dt
    }
    expect(steps).toBe(0)
    // 0.45s を越えた次の tick で1歩。
    expect(c.tick(dt, true)).toBe(true)
  })

  it('一定速で 0.45s 間隔(1秒あたり約2.2歩)になる', () => {
    const c = new FootstepCadence()
    let steps = 0
    const dt = 0.05
    const totalTime = 4.5 // s
    const n = Math.round(totalTime / dt)
    for (let i = 0; i < n; i++) {
      if (c.tick(dt, true)) steps++
    }
    // 踏み出し1歩 + 4.5s / 0.45s = 10 → 約11歩。±1 許容。
    expect(steps).toBeGreaterThanOrEqual(10)
    expect(steps).toBeLessThanOrEqual(12)
  })

  it('停止すると蓄積がリセットされ、再移動で再び踏み出しの1歩', () => {
    const c = new FootstepCadence()
    c.tick(0.016, true) // 踏み出し
    c.tick(0.3, true) // 0.3s 蓄積(まだ鳴らない)
    // 停止。
    expect(c.tick(0.1, false)).toBe(false)
    // 再移動で蓄積はリセットされ、再び踏み出し1歩。
    expect(c.tick(0.016, true)).toBe(true)
  })
})

describe('walkBobOffset(歩行ボブ ±0.03m。INTERACTION_SPEC §3.1 / AC4)', () => {
  it('WALK_BOB_AMPLITUDE は 0.03m', () => {
    expect(WALK_BOB_AMPLITUDE).toBeCloseTo(0.03, 6)
  })

  it('intensity=0(停止)では常に 0', () => {
    for (let p = 0; p < 5; p += 0.3) {
      expect(walkBobOffset(p, 0)).toBeCloseTo(0, 12)
    }
  })

  it('振幅は ±WALK_BOB_AMPLITUDE を超えない', () => {
    let maxAbs = 0
    for (let p = 0; p < 10; p += 0.01) {
      maxAbs = Math.max(maxAbs, Math.abs(walkBobOffset(p, 1)))
    }
    expect(maxAbs).toBeLessThanOrEqual(WALK_BOB_AMPLITUDE + 1e-9)
    expect(maxAbs).toBeGreaterThan(WALK_BOB_AMPLITUDE * 0.9) // ほぼ最大まで到達する
  })

  it('intensity でスケールする(0.5 なら振幅も半分)', () => {
    // 振幅最大付近の位相を探す。
    let bestP = 0
    let best = 0
    for (let p = 0; p < 2; p += 0.001) {
      const v = Math.abs(walkBobOffset(p, 1))
      if (v > best) {
        best = v
        bestP = p
      }
    }
    expect(Math.abs(walkBobOffset(bestP, 0.5))).toBeCloseTo(best * 0.5, 6)
  })
})
