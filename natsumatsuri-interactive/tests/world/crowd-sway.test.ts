import { describe, expect, it } from 'vitest'
import { crowdSwayAngle } from '../../src/world/crowd'

// ART §3: 群衆はゆっくり揺れる(±数度)。crowdSwayAngle は決定論的(index ベース位相)。
const FIVE_DEG = (5 * Math.PI) / 180

describe('群衆の揺れ crowdSwayAngle(ART §3: ±数度・ゆっくり・update駆動)', () => {
  it('揺れ角は ±5°(数度)の範囲に収まる', () => {
    let maxAbs = 0
    for (let i = 0; i < 18; i++) {
      for (let t = 0; t < 30; t += 0.1) {
        maxAbs = Math.max(maxAbs, Math.abs(crowdSwayAngle(i, t)))
      }
    }
    expect(maxAbs).toBeLessThanOrEqual(FIVE_DEG)
    expect(maxAbs).toBeGreaterThan(0) // 静止していない
  })

  it('同じ index・同じ時刻は同じ角(決定論的・再現可能)', () => {
    expect(crowdSwayAngle(3, 4.2)).toBe(crowdSwayAngle(3, 4.2))
  })

  it('個体ごとに位相がずれる(全員が同時に同じ向きへ揺れない)', () => {
    const t = 1.7
    const angles = new Set<number>()
    for (let i = 0; i < 18; i++) angles.add(crowdSwayAngle(i, t))
    // 位相・周期のジッタにより、ある時刻で全員が同一角になることはない。
    expect(angles.size).toBeGreaterThan(10)
  })

  it('時間とともに角が変化する(静止しない)', () => {
    const a = crowdSwayAngle(0, 0)
    const b = crowdSwayAngle(0, 1.5)
    expect(a).not.toBe(b)
  })
})
