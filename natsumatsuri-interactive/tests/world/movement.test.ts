import { describe, expect, it } from 'vitest'
import {
  WALK_SPEED,
  WALK_BOUNDS,
  clampToBounds,
  integrateMovement,
  keyboardMoveVector,
  mouseForwardVector,
  type Vec2,
} from '../../src/world/movement'
import { STALL_POSITION } from '../../src/world/stall'

describe('keyboardMoveVector(入力→方向ベクトル)', () => {
  it('前進は -Z(画面奥)', () => {
    expect(keyboardMoveVector({ forward: true, back: false, left: false, right: false })).toEqual({
      x: 0,
      z: -1,
    })
  })

  it('後退は +Z', () => {
    expect(keyboardMoveVector({ forward: false, back: true, left: false, right: false })).toEqual({
      x: 0,
      z: 1,
    })
  })

  it('左右は ∓X', () => {
    expect(keyboardMoveVector({ forward: false, back: false, left: true, right: false }).x).toBe(-1)
    expect(keyboardMoveVector({ forward: false, back: false, left: false, right: true }).x).toBe(1)
  })

  it('逆方向の同時押しは相殺される', () => {
    expect(keyboardMoveVector({ forward: true, back: true, left: true, right: true })).toEqual({
      x: 0,
      z: 0,
    })
  })
})

describe('integrateMovement(dt積分・フレームレート非依存)', () => {
  const origin: Vec2 = { x: 0, z: 0 }

  it('1秒前進で walkSpeed(3.0m)ぶん -Z に進む', () => {
    const next = integrateMovement(origin, { x: 0, z: -1 }, 1)
    expect(next.x).toBeCloseTo(0, 6)
    expect(next.z).toBeCloseTo(-WALK_SPEED, 6)
  })

  it('dt が半分なら移動量も半分(フレームレート非依存)', () => {
    const full = integrateMovement(origin, { x: 0, z: -1 }, 1)
    const half = integrateMovement(origin, { x: 0, z: -1 }, 0.5)
    expect(half.z).toBeCloseTo(full.z / 2, 6)
  })

  it('60Hz で 60 回積分 ≒ 1秒ぶん(累積一致)', () => {
    let pos: Vec2 = { x: 0, z: 0 }
    for (let i = 0; i < 60; i++) {
      pos = integrateMovement(pos, { x: 0, z: -1 }, 1 / 60)
    }
    expect(pos.z).toBeCloseTo(-WALK_SPEED, 5)
  })

  it('対角線移動でも速度が walkSpeed を超えない(入力を正規化)', () => {
    const next = integrateMovement(origin, { x: 1, z: -1 }, 1)
    const traveled = Math.hypot(next.x - origin.x, next.z - origin.z)
    expect(traveled).toBeCloseTo(WALK_SPEED, 6)
  })

  it('入力が零ベクトルなら動かない(クランプのみ)', () => {
    const next = integrateMovement({ x: 1, z: -2 }, { x: 0, z: 0 }, 1)
    expect(next).toEqual({ x: 1, z: -2 })
  })

  it('dt<=0 は移動しない', () => {
    const next = integrateMovement(origin, { x: 0, z: -1 }, 0)
    expect(next).toEqual({ x: 0, z: 0 })
  })
})

describe('clampToBounds / 歩行可能範囲(GDD §2 参道 幅8m・鳥居手前)', () => {
  it('x は [-4, 4] に収まる(参道幅8m)', () => {
    expect(WALK_BOUNDS.minX).toBe(-4)
    expect(WALK_BOUNDS.maxX).toBe(4)
    expect(clampToBounds({ x: 10, z: 0 }).x).toBe(4)
    expect(clampToBounds({ x: -10, z: 0 }).x).toBe(-4)
  })

  it('奥は鳥居(z=-60)の手前で止まる(z は minZ より先へ行けない)', () => {
    expect(WALK_BOUNDS.minZ).toBeGreaterThan(-60) // 鳥居の手前
    const clamped = clampToBounds({ x: 0, z: -100 })
    expect(clamped.z).toBe(WALK_BOUNDS.minZ)
    expect(clamped.z).toBeGreaterThan(-60)
  })

  it('手前(入口側)も maxZ でクランプされる', () => {
    expect(clampToBounds({ x: 0, z: 999 }).z).toBe(WALK_BOUNDS.maxZ)
  })

  it('積分で範囲外へ出ようとしてもクランプされる(境界で停止)', () => {
    // 右端 x=4 から右へ進み続けても x=4 を超えない。
    let pos: Vec2 = { x: 4, z: 0 }
    for (let i = 0; i < 30; i++) {
      pos = integrateMovement(pos, { x: 1, z: 0 }, 1 / 60)
    }
    expect(pos.x).toBe(WALK_BOUNDS.maxX)
  })
})

describe('mouseForwardVector(マウスのみ前進の屋台方向収束)', () => {
  it('convergence=0 はまっすぐ前進(-Z)', () => {
    const v = mouseForwardVector({ x: 0, z: 0 }, STALL_POSITION, 0)
    expect(v.x).toBeCloseTo(0, 6)
    expect(v.z).toBeCloseTo(-1, 6)
  })

  it('常に単位ベクトルを返す', () => {
    const v = mouseForwardVector({ x: 0, z: 0 }, STALL_POSITION, 0.35)
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1, 6)
  })

  it('convergence>0 は屋台側(+x)へ寄る(屋台は右=+x)', () => {
    const straight = mouseForwardVector({ x: 0, z: 0 }, STALL_POSITION, 0)
    const converged = mouseForwardVector({ x: 0, z: 0 }, STALL_POSITION, 0.35)
    expect(converged.x).toBeGreaterThan(straight.x)
  })

  it('マウスのみ前進(convergence=0.35)で屋台の近接圏(3m)へ到達できる', () => {
    // 入口中心(0,4)から左ボタン押下のみで前進し続け、屋台 3m 以内に入るか。
    let pos: Vec2 = { x: 0, z: 4 }
    let reached = false
    for (let i = 0; i < 60 * 30; i++) {
      // 最大30秒ぶん
      const fwd = mouseForwardVector(pos, STALL_POSITION, 0.35)
      pos = integrateMovement(pos, fwd, 1 / 60)
      const dist = Math.hypot(pos.x - STALL_POSITION.x, pos.z - STALL_POSITION.z)
      if (dist <= 3.0) {
        reached = true
        break
      }
    }
    expect(reached).toBe(true)
  })
})
