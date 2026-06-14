import { describe, expect, it } from 'vitest'
import { APPROACH } from '../../src/world/palette'
import { STALL_POSITION } from '../../src/world/stall'
import {
  FESTIVAL_STALL_COUNT,
  computeFestivalStallPlacements,
} from '../../src/world/festivalStalls'

/**
 * T-012 参道の賑わい — 縁日屋台 約19軒の配置/種類数の決定論テスト。
 * 描画見た目は art-director の目視レビュー(スクリーンショット)で確認する。ここでは
 * 「約19軒」「両脇に並ぶ」「歩行/既存金魚すくいを塞がない」「決定論的」を数値で担保する。
 */
describe('縁日屋台の種類・軒数(T-012: 約19軒で合計約20軒)', () => {
  it('新規屋台は約19軒(既存の金魚すくい1軒と合わせて約20軒)', () => {
    // 「約20軒」要件: 既存1 + 新規 = 18〜21 に収まること。
    expect(FESTIVAL_STALL_COUNT).toBeGreaterThanOrEqual(18)
    expect(FESTIVAL_STALL_COUNT).toBeLessThanOrEqual(21)
    expect(computeFestivalStallPlacements()).toHaveLength(FESTIVAL_STALL_COUNT)
  })

  it('種類(kind index)が一意で、多彩(全軒で種類が異なる)', () => {
    const kinds = computeFestivalStallPlacements().map((p) => p.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })
})

describe('縁日屋台の配置(参道両脇・歩行/近接を塞がない)', () => {
  const placements = computeFestivalStallPlacements()

  it('全軒が参道の外(|x| > 参道幅/2 = 4m)に置かれ、歩行可能範囲を塞がない', () => {
    const half = APPROACH.width / 2 // 4m
    for (const p of placements) {
      expect(Math.abs(p.x)).toBeGreaterThan(half)
    }
  })

  it('提灯列(x=±3.5)よりさらに外側に置かれる', () => {
    for (const p of placements) {
      expect(Math.abs(p.x)).toBeGreaterThan(APPROACH.width / 2 - 0.5)
    }
  })

  it('左右両側に並ぶ(片寄らない)', () => {
    expect(placements.some((p) => p.x < 0)).toBe(true)
    expect(placements.some((p) => p.x > 0)).toBe(true)
  })

  it('入口(z≈-4)〜鳥居手前(z≈-56)の参道内に収まる(鳥居 z=-60 を越えない)', () => {
    for (const p of placements) {
      expect(p.z).toBeLessThanOrEqual(0)
      expect(p.z).toBeGreaterThan(APPROACH.toriiZ) // 鳥居より手前
    }
  })

  it('既存の金魚すくい屋台(x=5,z=-26)に重ならない(近接判定・遊技を塞がない)', () => {
    // 右側屋台のうち、z が金魚すくいに近すぎるものが無いこと(中心間距離で判定)。
    for (const p of placements) {
      const sameSide = Math.sign(p.x) === Math.sign(STALL_POSITION.x)
      if (!sameSide) continue
      const dz = Math.abs(p.z - STALL_POSITION.z)
      // 屋台の奥行・近接半径(3m)を踏まえ、中心間 2m 以上空けていること。
      expect(dz).toBeGreaterThanOrEqual(2)
    }
  })

  it('開口の向きが参道中心を向く(左屋台は +Y回転 / 右屋台は -Y回転)', () => {
    for (const p of placements) {
      if (p.x < 0) expect(p.rotationY).toBeCloseTo(Math.PI / 2, 6)
      else expect(p.rotationY).toBeCloseTo(-Math.PI / 2, 6)
    }
  })

  it('決定論的(複数回呼んでも同一)', () => {
    expect(computeFestivalStallPlacements()).toEqual(computeFestivalStallPlacements())
  })
})
