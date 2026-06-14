import { describe, expect, it } from 'vitest'
import {
  APPROACH,
  LANTERN_X,
  lanternZ,
  jitter01,
  jitterRange,
} from '../../src/world/palette'
import {
  computeLanternAnchors,
  pickRepresentativeLanterns,
} from '../../src/world/lanterns'
import { computeCrowdPlacements } from '../../src/world/crowd'
import { STALL_POSITION } from '../../src/world/stall'

describe('提灯の配置(ART §3 / GDD §2)', () => {
  it('片側24個 × 2側 = 計48個', () => {
    const anchors = computeLanternAnchors()
    expect(APPROACH.lanternsPerSide).toBe(24)
    expect(anchors).toHaveLength(48)
  })

  it('左側はx=-LANTERN_X、右側はx=+LANTERN_Xに並ぶ(参道幅8mの内側)', () => {
    const anchors = computeLanternAnchors()
    const left = anchors.slice(0, APPROACH.lanternsPerSide)
    const right = anchors.slice(APPROACH.lanternsPerSide)
    expect(LANTERN_X).toBe(APPROACH.width / 2 - 0.5)
    expect(left.every((a) => a.x === -LANTERN_X)).toBe(true)
    expect(right.every((a) => a.x === LANTERN_X)).toBe(true)
    // 提灯は参道幅(8m)の内側に収まる。
    expect(Math.abs(LANTERN_X)).toBeLessThan(APPROACH.width / 2)
  })

  it('提灯は2.5m間隔で奥(-z)へ並ぶ', () => {
    expect(APPROACH.lanternSpacing).toBe(2.5)
    expect(lanternZ(0)).toBeCloseTo(0, 6)
    expect(lanternZ(1)).toBeCloseTo(-2.5, 6)
    expect(lanternZ(23)).toBeCloseTo(-57.5, 6)
    // 隣接間隔が常に 2.5m。
    for (let i = 1; i < APPROACH.lanternsPerSide; i++) {
      expect(lanternZ(i - 1) - lanternZ(i)).toBeCloseTo(2.5, 6)
    }
  })

  it('配置は決定論的(複数回呼んでも同一)', () => {
    expect(computeLanternAnchors()).toEqual(computeLanternAnchors())
  })
})

describe('提灯PointLightの代表選出(ART §4: 4灯まで)', () => {
  it('要求数ぶん返し、すべて実在の提灯位置である', () => {
    const anchors = computeLanternAnchors()
    const picks = pickRepresentativeLanterns(anchors, 4)
    expect(picks).toHaveLength(4)
    for (const pick of picks) {
      expect(anchors).toContainEqual(pick)
    }
  })

  it('count<=0 や空配列では空を返す', () => {
    expect(pickRepresentativeLanterns(computeLanternAnchors(), 0)).toEqual([])
    expect(pickRepresentativeLanterns([], 4)).toEqual([])
  })

  it('決定論的(同じ入力で同じ代表)', () => {
    const anchors = computeLanternAnchors()
    expect(pickRepresentativeLanterns(anchors, 4)).toEqual(
      pickRepresentativeLanterns(anchors, 4),
    )
  })
})

describe('群衆の配置(ART §3: 15〜20体)', () => {
  const placements = computeCrowdPlacements()

  it('体数が15〜20の範囲内', () => {
    expect(placements.length).toBeGreaterThanOrEqual(15)
    expect(placements.length).toBeLessThanOrEqual(20)
  })

  it('身長が1.5〜1.8mの範囲内', () => {
    for (const p of placements) {
      expect(p.height).toBeGreaterThanOrEqual(1.5)
      expect(p.height).toBeLessThanOrEqual(1.8)
    }
  })

  it('全員が参道の外(|x| > 参道幅/2)に立つ(参道上に立たない)', () => {
    const half = APPROACH.width / 2
    for (const p of placements) {
      expect(Math.abs(p.x)).toBeGreaterThan(half)
    }
  })

  it('左右に振り分けられている', () => {
    expect(placements.some((p) => p.x < 0)).toBe(true)
    expect(placements.some((p) => p.x > 0)).toBe(true)
  })

  it('決定論的(複数回呼んでも同一)', () => {
    expect(computeCrowdPlacements()).toEqual(computeCrowdPlacements())
  })
})

describe('屋台・鳥居の配置座標(GDD §2)', () => {
  it('屋台は参道中腹の右側(+x)・奥行き中央付近', () => {
    expect(STALL_POSITION.x).toBeGreaterThan(0) // 右側
    expect(STALL_POSITION.z).toBeLessThan(0) // 奥(参道内)
    // 中腹 = 奥行60mの概ね中央(-20〜-40)。
    expect(STALL_POSITION.z).toBeLessThan(-20)
    expect(STALL_POSITION.z).toBeGreaterThan(-40)
  })

  it('鳥居は参道終端 z≈-60、高さ8m', () => {
    expect(APPROACH.toriiZ).toBe(-60)
    expect(APPROACH.toriiHeight).toBe(8)
  })
})

describe('決定論的ジッタ(core/rng非依存)', () => {
  it('jitter01は0..1の範囲で、同一indexは同一値(再現可能)', () => {
    for (let i = 0; i < 50; i++) {
      const v = jitter01(i)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      expect(jitter01(i)).toBe(v)
    }
  })

  it('seedが違えば異なる値を出す', () => {
    expect(jitter01(3, 0)).not.toBe(jitter01(3, 1))
  })

  it('jitterRangeは[min,max)へ写像する', () => {
    for (let i = 0; i < 50; i++) {
      const v = jitterRange(i, 3, 5)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThan(5)
    }
  })
})
