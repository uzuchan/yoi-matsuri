import { describe, expect, it } from 'vitest'
import { DEFAULT_GOLDFISH_PARAMS, GoldfishSession, Poi } from '../../../src/game/goldfish'
import type { GoldfishParams } from '../../../src/game/goldfish'

/**
 * AC8(f): 「パラメータを変えると結果が変わる」= 値が結果に影響することの証明。
 * 各パラメータを単独で変えたとき、観測可能な結果(破損までの時間・追従速度・捕獲可否)が
 * 変化することを固定する。これは GDD §4.3 の各値がロジックに実接続されている保証でもある。
 */

const DT = 1 / 60
const P = DEFAULT_GOLDFISH_PARAMS

/** 水中静止で破損するまでのフレーム数を返す(wetDamagePerSec 等の影響観測)。 */
function framesToTear(params: GoldfishParams): number {
  const s = new GoldfishSession({ params, seed: 1 })
  const target = { x: 0, z: 0 }
  for (let i = 0; i < 100000; i++) {
    s.update(DT, { target, submerge: true })
    if (s.currentStatus === 'torn') return i + 1
  }
  return Infinity
}

describe('AC8(f) パラメータ影響: 紙耐久', () => {
  it('paperDurability を上げると破損が遅くなる', () => {
    const low = framesToTear({ ...P, paperDurability: 40 })
    const high = framesToTear({ ...P, paperDurability: 80 })
    expect(high).toBeGreaterThan(low)
  })

  it('wetDamagePerSec を上げると破損が早くなる', () => {
    const slow = framesToTear({ ...P, wetDamagePerSec: 2 })
    const fast = framesToTear({ ...P, wetDamagePerSec: 8 })
    expect(fast).toBeLessThan(slow)
  })

  it('speedDamageCoeff を上げると、同じ動きでの被ダメージが増える(同フレーム比較)', () => {
    function damageMovingOneSecond(coeff: number): number {
      const params: GoldfishParams = { ...P, speedDamageCoeff: coeff }
      const poi = new Poi(params, { x: 0, z: 0 })
      poi.setSubmerged(true)
      let total = 0
      for (let i = 0; i < 60; i++) {
        poi.setTarget({ x: (i + 1) * 0.01, z: 0 }) // 等速で移動
        total += poi.update(DT)
      }
      return total
    }
    expect(damageMovingOneSecond(440)).toBeGreaterThan(damageMovingOneSecond(110))
  })

  it('fishWeightDamage を変えると捕獲時の被ダメージが変わる', () => {
    function captureDamage(weight: number): number {
      const params: GoldfishParams = {
        ...P,
        fishWeightDamage: weight,
        fishCount: 1,
        fishCruiseSpeed: 0,
        fishFleeSpeed: 0,
      }
      const s = new GoldfishSession({ params, seed: 1 })
      const target = s.fishStates[0].position
      for (let i = 0; i < 200; i++) s.update(DT, { target, submerge: false })
      const before = s.poiState.durability
      s.update(DT, { target, submerge: true })
      s.update(DT, { target, submerge: false }) // capture
      return before - s.poiState.durability
    }
    expect(captureDamage(20)).toBeGreaterThan(captureDamage(5))
  })
})

describe('AC8(f) パラメータ影響: 追従物理', () => {
  it('poiFollowLag を上げると追従が遅くなる(同 dt での到達距離が減る)', () => {
    function step1Distance(lag: number): number {
      const params: GoldfishParams = { ...P, poiFollowLag: lag }
      const poi = new Poi(params, { x: 0, z: 0 })
      poi.setTarget({ x: 1, z: 0 })
      poi.update(DT)
      return poi.position.x
    }
    expect(step1Distance(0.06)).toBeGreaterThan(step1Distance(0.24)) // lag 小=速い
  })

  it('waterDragFactor を上げると水中追従がより遅くなる', () => {
    function waterStep1(drag: number): number {
      const params: GoldfishParams = { ...P, waterDragFactor: drag }
      const poi = new Poi(params, { x: 0, z: 0 })
      poi.setSubmerged(true)
      poi.setTarget({ x: 1, z: 0 })
      poi.update(DT)
      return poi.position.x
    }
    expect(waterStep1(2)).toBeGreaterThan(waterStep1(6)) // drag 大=遅い
  })
})

describe('AC8(f) パラメータ影響: 捕獲ゲート', () => {
  it('liftSpeedMax を上げると、同じ速い持ち上げでも捕獲が成立しうる(=値が判定に効く)', () => {
    function tryCatchWithFastLift(liftMax: number): boolean {
      const params: GoldfishParams = {
        ...P,
        liftSpeedMax: liftMax,
        fishCount: 1,
        fishCruiseSpeed: 0,
        fishFleeSpeed: 0,
      }
      const s = new GoldfishSession({ params, seed: 1 })
      const fish = s.fishStates[0].position
      for (let i = 0; i < 200; i++) s.update(DT, { target: fish, submerge: false })
      s.update(DT, { target: fish, submerge: true })
      // ポイ速度 ~0.3m/s 程度になる中距離移動(0.005m/フレーム=0.3m/s)。
      const fastTarget = { x: fish.x + 0.06, z: fish.z }
      const events = s.update(DT, { target: fastTarget, submerge: false })
      return events.some((e) => e.type === 'caught')
    }
    // ポイ速度を確認用に測る。
    const probe = new GoldfishSession({
      params: { ...P, fishCount: 1, fishCruiseSpeed: 0, fishFleeSpeed: 0 },
      seed: 1,
    })
    const fish = probe.fishStates[0].position
    for (let i = 0; i < 200; i++) probe.update(DT, { target: fish, submerge: false })
    probe.update(DT, { target: fish, submerge: true })
    probe.update(DT, { target: { x: fish.x + 0.06, z: fish.z }, submerge: false })
    const liftSpeed = probe.poiState.speed
    // この持ち上げ速度は厳しい既定 liftSpeedMax(0.35)を跨ぐ値域で評価する。
    // liftSpeedMax を十分大きくすれば捕獲成立、十分小さくすれば失敗。
    expect(tryCatchWithFastLift(liftSpeed + 0.5)).toBe(true) // 緩い → 捕獲
    expect(tryCatchWithFastLift(liftSpeed - 0.05)).toBe(false) // 厳しい → 失敗
  })

  it('poiRadius を広げると、より遠い金魚も捕獲できる(=値が円判定に効く)', () => {
    function tryCatchAtOffset(radius: number, offset: number): boolean {
      const params: GoldfishParams = {
        ...P,
        poiRadius: radius,
        fishCount: 1,
        fishCruiseSpeed: 0,
        fishFleeSpeed: 0,
      }
      const s = new GoldfishSession({ params, seed: 1 })
      const fish = s.fishStates[0].position
      const aim = { x: fish.x + offset, z: fish.z } // 金魚から offset だけずれた位置で持ち上げ
      for (let i = 0; i < 300; i++) s.update(DT, { target: aim, submerge: false })
      s.update(DT, { target: aim, submerge: true })
      const events = s.update(DT, { target: aim, submerge: false })
      return events.some((e) => e.type === 'caught')
    }
    const offset = 0.12
    expect(tryCatchAtOffset(0.09, offset)).toBe(false) // 既定半径では届かない
    expect(tryCatchAtOffset(0.2, offset)).toBe(true) // 半径を広げれば届く
  })

  it('fishEscapeRadius を変えると逃避開始距離が変わる(session 経由で観測)', () => {
    function fleesAtDistance(escapeRadius: number, dist: number): boolean {
      const params: GoldfishParams = {
        ...P,
        fishEscapeRadius: escapeRadius,
        fishCount: 1,
        fishCruiseSpeed: 0,
      }
      const s = new GoldfishSession({ params, seed: 1 })
      const fish = s.fishStates[0].position
      // 金魚から dist だけ離れた位置に submerged ポイを置く。
      const aim = { x: fish.x + dist, z: fish.z }
      // ポイを aim へ寄せてから submerge(接近中は逃げない)。
      for (let i = 0; i < 300; i++) s.update(DT, { target: aim, submerge: false })
      s.update(DT, { target: aim, submerge: true })
      return s.fishStates[0].fleeing
    }
    const dist = 0.15
    expect(fleesAtDistance(0.1, dist)).toBe(false) // 逃避半径 < 距離 → 逃げない
    expect(fleesAtDistance(0.25, dist)).toBe(true) // 逃避半径 > 距離 → 逃げる
  })

  it('fishCount を変えると金魚配列の長さが変わる', () => {
    expect(new GoldfishSession({ params: { ...P, fishCount: 3 }, seed: 1 }).fishStates).toHaveLength(3)
    expect(new GoldfishSession({ params: { ...P, fishCount: 12 }, seed: 1 }).fishStates).toHaveLength(12)
  })

  it('sessionTimeLimit を変えると残時間の初期値・タイムアウト到達が変わる', () => {
    const s = new GoldfishSession({ params: { ...P, sessionTimeLimit: 5 }, seed: 1 })
    expect(s.timeLeft).toBe(5)
    let frames = 0
    while (s.currentStatus === 'playing' && frames < 100000) {
      s.update(DT, { target: { x: 0, z: 0 }, submerge: false })
      frames += 1
    }
    expect(s.currentStatus).toBe('timeout')
    expect(frames).toBeCloseTo(5 / DT, -1) // 約 300 フレーム
  })
})
