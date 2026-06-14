import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GOLDFISH_PARAMS,
  DEFAULT_TANK_BOUNDS,
  Fish,
  FISH_FLEE_DURATION,
  SeededRandom,
} from '../../../src/game/goldfish'
import type { Vec2 } from '../../../src/game/goldfish'

/**
 * AC5(金魚AI: wander=cruise / 逃避=flee 0.8s / 境界転回) + 決定論的 seed(再現可能)の固定。
 */

const DT = 1 / 60
const P = DEFAULT_GOLDFISH_PARAMS
const B = DEFAULT_TANK_BOUNDS
const FAR = { x: 999, z: 999 } as const // 逃避を起こさない遠いポイ

function makeFish(seed: number, start: Vec2): Fish {
  return new Fish(0, P, B, new SeededRandom(seed), start)
}

/** 楕円内にいるか(x²/rx² + z²/rz² ≤ 1)。 */
function insideTank(pos: Vec2): boolean {
  return (pos.x * pos.x) / (B.radiusX * B.radiusX) + (pos.z * pos.z) / (B.radiusZ * B.radiusZ) <= 1.0001
}

describe('Fish AI(GDD §4.5)', () => {
  it('決定論: 同じ seed なら同じ軌跡(再現可能)', () => {
    const a = makeFish(42, { x: 0, z: 0 })
    const b = makeFish(42, { x: 0, z: 0 })
    for (let i = 0; i < 600; i++) {
      a.update(DT, FAR, false)
      b.update(DT, FAR, false)
    }
    expect(a.position).toEqual(b.position)
  })

  it('決定論: 違う seed なら(一般に)違う軌跡', () => {
    const a = makeFish(1, { x: 0, z: 0 })
    const b = makeFish(2, { x: 0, z: 0 })
    for (let i = 0; i < 600; i++) {
      a.update(DT, FAR, false)
      b.update(DT, FAR, false)
    }
    expect(a.position).not.toEqual(b.position)
  })

  it('wander: 通常時は概ね fishCruiseSpeed で動く', () => {
    const fish = makeFish(7, { x: 0, z: 0 })
    const before = fish.position
    fish.update(DT, FAR, false)
    const after = fish.position
    const moved = Math.hypot(after.x - before.x, after.z - before.z)
    expect(moved).toBeCloseTo(P.fishCruiseSpeed * DT, 4)
    expect(fish.isFleeing).toBe(false)
  })

  it('境界転回: 長時間泳いでも常に水槽(楕円)内に留まる', () => {
    const fish = makeFish(123, { x: 0.5, z: 0.3 })
    for (let i = 0; i < 5000; i++) {
      fish.update(DT, FAR, false)
      expect(insideTank(fish.position)).toBe(true)
    }
  })

  it('AC8(e): 水中ポイが fishEscapeRadius 内に来ると逃避する(逆方向・fishFleeSpeed)', () => {
    // 金魚を原点、ポイをその右(逃避半径内)に置き、submerged=true で逃避を誘発。
    const fish = makeFish(3, { x: 0, z: 0 })
    const poi: Vec2 = { x: P.fishEscapeRadius * 0.5, z: 0 } // 内側
    const before = fish.position
    fish.update(DT, poi, true)
    const after = fish.position
    expect(fish.isFleeing).toBe(true)
    // ポイは右(+x)にいるので、金魚は左(-x)へ逃げる。
    expect(after.x).toBeLessThan(before.x)
    // 速度は fishFleeSpeed。
    const moved = Math.hypot(after.x - before.x, after.z - before.z)
    expect(moved).toBeCloseTo(P.fishFleeSpeed * DT, 4)
  })

  it('逃避は水中ポイのみ: 同じ距離でも submerged=false なら逃げない', () => {
    const fish = makeFish(3, { x: 0, z: 0 })
    const poi: Vec2 = { x: P.fishEscapeRadius * 0.5, z: 0 }
    fish.update(DT, poi, false) // 空中ポイ
    expect(fish.isFleeing).toBe(false)
    // 通常 wander 速度のまま。
    const moved = Math.hypot(fish.position.x, fish.position.z)
    expect(moved).toBeCloseTo(P.fishCruiseSpeed * DT, 4)
  })

  it('逃避半径の外なら逃げない(境界値)', () => {
    const fish = makeFish(3, { x: 0, z: 0 })
    const poi: Vec2 = { x: P.fishEscapeRadius + 0.001, z: 0 } // ほんの少し外
    fish.update(DT, poi, true)
    expect(fish.isFleeing).toBe(false)
  })

  it('逃避は FISH_FLEE_DURATION(0.8s)持続し、その後 wander へ戻る', () => {
    const fish = makeFish(3, { x: 0, z: 0 })
    const poi: Vec2 = { x: P.fishEscapeRadius * 0.5, z: 0 }
    // 1 回だけ逃避を誘発(以後ポイは遠くへ)。
    fish.update(DT, poi, true)
    expect(fish.isFleeing).toBe(true)
    // 0.8s 弱まで逃避継続。
    const stepsDuring = Math.floor(FISH_FLEE_DURATION / DT) - 2
    for (let i = 0; i < stepsDuring; i++) fish.update(DT, FAR, false)
    expect(fish.isFleeing).toBe(true)
    // 0.8s を超えると逃避終了。
    for (let i = 0; i < 5; i++) fish.update(DT, FAR, false)
    expect(fish.isFleeing).toBe(false)
  })

  it('逃避中も水槽内に留まる(境界での内向き反射)', () => {
    // 端近くで外向きへ逃げるよう仕向ける。
    const fish = makeFish(9, { x: 0.55, z: 0 })
    const poi: Vec2 = { x: 0.45, z: 0 } // 金魚の内側 → 金魚は +x(外)へ逃げようとする
    fish.update(DT, poi, true)
    for (let i = 0; i < 200; i++) {
      fish.update(DT, FAR, false)
      expect(insideTank(fish.position)).toBe(true)
    }
  })

  it('ライフサイクル: onPoi 中は AI で動かず、followPoi の位置に従う', () => {
    const fish = makeFish(5, { x: 0, z: 0 })
    fish.setOnPoi()
    expect(fish.currentStatus).toBe('onPoi')
    fish.update(DT, FAR, false) // onPoi は no-op
    fish.followPoi({ x: 0.2, z: -0.1 })
    expect(fish.position).toEqual({ x: 0.2, z: -0.1 })
    fish.update(DT, FAR, false)
    expect(fish.position).toEqual({ x: 0.2, z: -0.1 }) // 動かない
  })

  it('ライフサイクル: secured は AI 対象外、returnToTank で泳ぎ再開', () => {
    const fish = makeFish(5, { x: 0.1, z: 0.1 })
    fish.setSecured()
    const p0 = fish.position
    fish.update(DT, FAR, false)
    expect(fish.position).toEqual(p0) // secured は動かない
    fish.returnToTank()
    expect(fish.currentStatus).toBe('swimming')
    fish.update(DT, FAR, false)
    expect(fish.position).not.toEqual(p0) // 再び泳ぐ
  })

  it('snapshot: 描画に必要な id/position/heading/status/fleeing を返す', () => {
    const fish = new Fish(3, P, B, new SeededRandom(1), { x: 0.1, z: 0.2 })
    const s = fish.snapshot()
    expect(s.id).toBe(3)
    expect(s.position).toEqual({ x: 0.1, z: 0.2 })
    expect(s.status).toBe('swimming')
    expect(s.fleeing).toBe(false)
    expect(typeof s.heading.x).toBe('number')
  })
})
