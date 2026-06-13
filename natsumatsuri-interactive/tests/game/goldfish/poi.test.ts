import { describe, expect, it } from 'vitest'
import { DEFAULT_GOLDFISH_PARAMS, Poi } from '../../../src/game/goldfish'
import type { GoldfishParams, Vec2 } from '../../../src/game/goldfish'

/**
 * AC2(ポイ慣性追従・空中/水中・dtベース) / AC3(紙耐久: 水中滞在 + speed² 移動 + 金魚荷重) の固定。
 */

const DT = 1 / 60
const P = DEFAULT_GOLDFISH_PARAMS

/** dt 秒ずつ steps 回 update し、各ステップのダメージ合計を返す。 */
function run(poi: Poi, steps: number, dt = DT): number {
  let total = 0
  for (let i = 0; i < steps; i++) total += poi.update(dt)
  return total
}

/**
 * 水中ポイを「実速度ちょうど speed[m/s]」で durationSec 秒間まっすぐ動かし、総ダメージを返す。
 * 指数追従(alpha = 1-exp(-dt/tau))の遅れを打ち消すため、毎フレーム
 *   target = pos + dir*(step/alpha)   (step = speed*dt)
 * を与える。すると pos += (target-pos)*alpha = dir*step となり、pos が厳密に等速で前進する。
 */
function runConstantSpeed(
  params: GoldfishParams,
  speed: number,
  durationSec: number,
  dt = DT,
): number {
  const poi = new Poi(params, { x: 0, z: 0 })
  poi.setSubmerged(true)
  const tauWater = params.poiFollowLag * params.waterDragFactor
  const alpha = 1 - Math.exp(-dt / tauWater)
  const step = speed * dt
  const steps = Math.round(durationSec / dt)
  let total = 0
  for (let i = 0; i < steps; i++) {
    const cur = poi.position
    poi.setTarget({ x: cur.x + step / alpha, z: cur.z })
    total += poi.update(dt)
  }
  return total
}

describe('Poi 物理(慣性追従・dtベース)', () => {
  it('初期状態: 開始位置・水面・満タン耐久', () => {
    const poi = new Poi(P, { x: 0.1, z: -0.2 })
    const s = poi.snapshot()
    expect(s.position).toEqual({ x: 0.1, z: -0.2 })
    expect(s.submerged).toBe(false)
    expect(s.depth).toBe(0)
    expect(s.durability).toBe(P.paperDurability)
    expect(s.durabilityRatio).toBe(1)
  })

  it('目標へ慣性追従する(1ステップで一気に到達しない・徐々に近づく)', () => {
    const poi = new Poi(P, { x: 0, z: 0 })
    poi.setTarget({ x: 1, z: 0 })
    poi.update(DT)
    const x1 = poi.position.x
    expect(x1).toBeGreaterThan(0)
    expect(x1).toBeLessThan(1) // 即時追従ではない
    // さらに進めると目標に近づく(単調収束)。
    run(poi, 200)
    expect(poi.position.x).toBeGreaterThan(0.99)
  })

  it('submerge 状態を反映し、深さが dipDepth / 0 に切り替わる', () => {
    const poi = new Poi(P, { x: 0, z: 0 })
    expect(poi.snapshot().depth).toBe(0)
    poi.setSubmerged(true)
    poi.update(DT)
    expect(poi.snapshot().depth).toBeCloseTo(P.dipDepth, 10)
    expect(poi.snapshot().submerged).toBe(true)
    poi.setSubmerged(false)
    poi.update(DT)
    expect(poi.snapshot().depth).toBe(0)
  })

  it('AC8(b): 水中の追従が空中より waterDragFactor 倍だけ遅い(時定数比)', () => {
    // 同じ「目標距離の 63.2%(=1-1/e, 1時定数ぶん)に到達するまでの時間」を空中/水中で測る。
    // 連続時間一次遅れの時定数は air=poiFollowLag, water=poiFollowLag×waterDragFactor なので、
    // 到達時間の比は waterDragFactor になるはず。
    const fineDt = 1 / 600 // 細かい dt で離散化誤差を抑える
    const reachFraction = 1 - 1 / Math.E // ≈0.632

    function timeToFraction(submerged: boolean): number {
      const poi = new Poi(P, { x: 0, z: 0 })
      poi.setSubmerged(submerged)
      poi.setTarget({ x: 1, z: 0 })
      let t = 0
      for (let i = 0; i < 100000; i++) {
        poi.update(fineDt)
        t += fineDt
        if (poi.position.x >= reachFraction) break
      }
      return t
    }

    const airTime = timeToFraction(false)
    const waterTime = timeToFraction(true)
    // 空中の時定数は poiFollowLag に一致する。
    expect(airTime).toBeCloseTo(P.poiFollowLag, 2)
    // 水中は waterDragFactor 倍遅い。
    expect(waterTime / airTime).toBeCloseTo(P.waterDragFactor, 1)
  })

  it('dt 非依存: 大 dt 1 回と小 dt 複数回で同じ目標へ同程度収束する', () => {
    const a = new Poi(P, { x: 0, z: 0 })
    a.setTarget({ x: 1, z: 0 })
    a.update(0.1) // 1 回で 0.1s

    const b = new Poi(P, { x: 0, z: 0 })
    b.setTarget({ x: 1, z: 0 })
    for (let i = 0; i < 10; i++) b.update(0.01) // 10 回で 0.1s

    // 指数平滑は厳密には dt 依存だが、同じ経過時間ならほぼ一致する(フレームレート非依存)。
    expect(a.position.x).toBeCloseTo(b.position.x, 2)
  })
})

describe('Poi 紙耐久(GDD §4.3)', () => {
  it('空中(水面上)では移動しても耐久が減らない', () => {
    const poi = new Poi(P, { x: 0, z: 0 })
    poi.setSubmerged(false)
    poi.setTarget({ x: 1, z: 0 })
    const dmg = run(poi, 60) // 1 秒
    expect(dmg).toBe(0)
    expect(poi.remainingDurability).toBe(P.paperDurability)
  })

  it('水中で静止していると wetDamagePerSec/s で減る(≈4pt/s)', () => {
    const poi = new Poi(P, { x: 0, z: 0 })
    poi.setSubmerged(true)
    poi.setTarget({ x: 0, z: 0 }) // 静止 → 移動ダメージ 0
    const dmg = run(poi, 60) // 1 秒
    expect(dmg).toBeCloseTo(P.wetDamagePerSec, 6) // 4.0pt/s
    expect(poi.remainingDurability).toBeCloseTo(P.paperDurability - P.wetDamagePerSec, 6)
  })

  it('AC3 次元: 水中を 1m/s で動かすと damage/s ≈ wet + coeff×1² = 4 + 220 = 224pt/s', () => {
    // ポイを「実速度ちょうど 1m/s」で 1 秒間まっすぐ動かす。
    // 指数追従の遅れを打ち消すため、毎フレーム target = pos + dir*(step/alpha) を与え、
    // pos の前進量を step(=speed*dt)に厳密一致させる(等速直線運動)。
    const speed = 1.0
    const total = runConstantSpeed(P, speed, 1.0)
    // 1 秒で受ける総ダメージ ≈ 224pt(±数pt の離散化誤差)。
    expect(total).toBeCloseTo(P.wetDamagePerSec + P.speedDamageCoeff * speed * speed, 0)
  })

  it('AC8(a)/AC3: 同じ距離でも速く動かすほど総ダメージが大きい(speed² の効果)', () => {
    // 同じ距離 0.3m を、速い実速度(0.6m/s)/遅い実速度(0.1m/s)で動かす。
    // 移動ダメージ ∫coeff·v² dt = coeff·v·distance なので速いほど大きい(speed² 由来)。
    const distance = 0.3
    const fast = runConstantSpeed(P, 0.6, distance / 0.6) // 0.5s
    const slow = runConstantSpeed(P, 0.1, distance / 0.1) // 3.0s
    expect(fast).toBeGreaterThan(slow)
    // 移動ダメージ成分は v 比(6倍)で効く。wet 成分を考慮しても速いほうが明確に大きい。
    expect(fast).toBeGreaterThan(slow * 1.5)
  })

  it('金魚荷重ダメージ(持ち上げ瞬間)は固定 fishWeightDamage', () => {
    const poi = new Poi(P, { x: 0, z: 0 })
    const reduced = poi.applyFishWeightDamage()
    expect(reduced).toBe(P.fishWeightDamage) // 12pt
    expect(poi.remainingDurability).toBe(P.paperDurability - P.fishWeightDamage)
  })

  it('耐久は 0 未満にならず、0 で isTorn が true', () => {
    const params: GoldfishParams = { ...P, paperDurability: 5 }
    const poi = new Poi(params, { x: 0, z: 0 })
    expect(poi.isTorn).toBe(false)
    poi.applyFishWeightDamage() // 12pt → 0 でクランプ
    expect(poi.remainingDurability).toBe(0)
    expect(poi.isTorn).toBe(true)
    expect(poi.snapshot().durabilityRatio).toBe(0)
  })

  it('dt<=0 は安全に no-op(速度0・ダメージ0)', () => {
    const poi = new Poi(P, { x: 0, z: 0 })
    poi.setSubmerged(true)
    poi.setTarget({ x: 1, z: 0 })
    const dmg = poi.update(0)
    expect(dmg).toBe(0)
    expect(poi.horizontalSpeed).toBe(0)
    expect(poi.remainingDurability).toBe(P.paperDurability)
  })
})

// 型の利用(未使用 import 警告回避 & 型シグネチャの簡易確認)。
const _exampleTarget: Vec2 = { x: 0, z: 0 }
void _exampleTarget
