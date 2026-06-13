import { describe, expect, it } from 'vitest'
import { DEFAULT_GOLDFISH_PARAMS, GoldfishSession } from '../../../src/game/goldfish'
import type {
  GoldfishEvent,
  GoldfishParams,
  GoldfishInput,
  Vec2,
} from '../../../src/game/goldfish'

/**
 * AC4(すくい判定) / AC6(セッション進行・status) / AC7(状態変化記述子) の固定。
 * 捕獲メカニクスの分離検証には「静止金魚」(cruise/flee=0)を使い、ポイ円・速度ゲートのみを切り出す。
 * 逃避 AI 自体は fish.test.ts で検証済み。
 */

const DT = 1 / 60
const P = DEFAULT_GOLDFISH_PARAMS

/** 静止金魚(cruise/flee=0)・1匹のセッション。捕獲メカニクスの純粋検証用。 */
function stillFishSession(overrides: Partial<GoldfishParams> = {}): GoldfishSession {
  const params: GoldfishParams = {
    ...P,
    fishCruiseSpeed: 0,
    fishFleeSpeed: 0,
    fishCount: 1,
    ...overrides,
  }
  return new GoldfishSession({ params, seed: 1 })
}

function fishPos(s: GoldfishSession): Vec2 {
  return s.fishStates[0].position
}

/**
 * ポイをゆっくり金魚位置へ寄せて co-locate する(submerge=false で接近=耐久温存・低速)。
 * 静止金魚前提。十分な回数で誤差 < poiRadius/4 に収める。
 */
function approachFish(s: GoldfishSession): void {
  const target = fishPos(s)
  for (let i = 0; i < 400; i++) {
    s.update(DT, { target, submerge: false })
  }
}

describe('GoldfishSession 捕獲判定(GDD §4.5)', () => {
  it('AC8(c): liftSpeedMax 以下の持ち上げで捕獲成立(caught イベント・確保前)', () => {
    const s = stillFishSession()
    approachFish(s)
    const target = fishPos(s)
    // 沈める(1フレーム)。
    s.update(DT, { target, submerge: true })
    // 低速のまま持ち上げる(target 据え置き=ポイ速度≈0 ≤ liftSpeedMax)。
    const events = s.update(DT, { target, submerge: false })
    const caught = events.filter((e) => e.type === 'caught')
    expect(caught).toHaveLength(1)
    expect(s.totalCaught).toBe(1)
    expect(s.securedCount).toBe(0) // 確保はまだ
    expect(s.fishStates[0].status).toBe('onPoi')
  })

  it('捕獲成立時に金魚荷重ダメージ(fishWeightDamage)が 1 回入る', () => {
    const s = stillFishSession()
    approachFish(s)
    const durBefore = s.poiState.durability
    const target = fishPos(s)
    s.update(DT, { target, submerge: true })
    s.update(DT, { target, submerge: false }) // lift → capture
    // 水中1フレーム分の微小ダメージ + fishWeightDamage(12pt)。少なくとも 12pt は減る。
    expect(durBefore - s.poiState.durability).toBeGreaterThanOrEqual(P.fishWeightDamage)
  })

  it('AC8(c): liftSpeedMax 超過の持ち上げは捕獲失敗(fish-escape・耐久ダメージ無し)', () => {
    const s = stillFishSession()
    approachFish(s)
    const fish = fishPos(s)
    // 沈める。
    s.update(DT, { target: fish, submerge: true })
    // 持ち上げ(=水面上)フレームでの被ダメージのみを観測するため、ここで耐久を記録する。
    const durBefore = s.poiState.durability
    // 速い持ち上げ: ポイは金魚のすぐ近く(円内)に留めつつ、実速度を liftSpeedMax 超にする。
    // 1 フレームの移動量を fastSpeed*dt(< poiRadius)に保つため、空中 alpha で目標を逆算する。
    const fastSpeed = 0.5 // > liftSpeedMax(0.35)
    const stepDist = fastSpeed * DT // ≈0.0083m < poiRadius(0.09) → 円内のまま
    const alphaAir = 1 - Math.exp(-DT / P.poiFollowLag)
    const cur = s.poiState.position
    const aim = { x: cur.x + stepDist / alphaAir, z: cur.z }
    const events = s.update(DT, { target: aim, submerge: false })
    // 前提: ポイ速度が超過 & 金魚はまだ円内(=位置でなく速度で失敗していること)。
    expect(s.poiState.speed).toBeGreaterThan(P.liftSpeedMax)
    expect(Math.hypot(s.poiState.position.x - fish.x, s.poiState.position.z - fish.z)).toBeLessThan(
      P.poiRadius,
    )
    const escapes = events.filter((e) => e.type === 'fish-escape')
    expect(escapes.length).toBeGreaterThanOrEqual(1)
    expect(events.some((e) => e.type === 'caught')).toBe(false)
    expect(s.totalCaught).toBe(0)
    // 失敗時は耐久ダメージ無し(金魚荷重は入らない)。持ち上げフレームは水中ではないので0。
    expect(s.poiState.durability).toBe(durBefore)
    expect(s.fishStates[0].status).toBe('swimming')
  })

  it('ポイ円外の金魚は捕獲されない(poiRadius 境界)', () => {
    const s = stillFishSession()
    approachFish(s)
    const fish = fishPos(s)
    // ポイ円のすぐ外へ寄せ直す。
    const offset = { x: fish.x + P.poiRadius + 0.02, z: fish.z }
    for (let i = 0; i < 400; i++) s.update(DT, { target: offset, submerge: false })
    s.update(DT, { target: offset, submerge: true })
    const events = s.update(DT, { target: offset, submerge: false })
    expect(events.some((e) => e.type === 'caught')).toBe(false)
  })

  it('AC4: 捕獲した金魚を secure でお椀へ確保(secured インクリメント)', () => {
    const s = stillFishSession()
    approachFish(s)
    const target = fishPos(s)
    s.update(DT, { target, submerge: true })
    s.update(DT, { target, submerge: false }) // capture
    expect(s.fishStates[0].status).toBe('onPoi')
    // 確保。
    const events = s.update(DT, { target, submerge: false, secure: true })
    const secured = events.filter((e) => e.type === 'secured')
    expect(secured).toHaveLength(1)
    expect(s.securedCount).toBe(1)
    expect(s.fishStates[0].status).toBe('secured')
  })
})

describe('GoldfishSession 進行・status(GDD §4.4 / AC6)', () => {
  it('初期状態: playing・残時間 sessionTimeLimit・fishCount 匹・確保0', () => {
    const s = new GoldfishSession({ seed: 1 })
    expect(s.currentStatus).toBe('playing')
    expect(s.timeLeft).toBe(P.sessionTimeLimit)
    expect(s.fishStates).toHaveLength(P.fishCount)
    expect(s.securedCount).toBe(0)
    expect(s.snapshot().poi.durability).toBe(P.paperDurability)
  })

  it('残時間が dt ぶんカウントダウンする', () => {
    const s = new GoldfishSession({ seed: 1 })
    s.update(DT, { target: { x: 0, z: 0 }, submerge: false })
    expect(s.timeLeft).toBeCloseTo(P.sessionTimeLimit - DT, 6)
  })

  it('AC8(d): 耐久0でその場 torn 終了(poi-torn + finished{torn})。確保0なので caught=0', () => {
    // 低耐久にして水中静止で素早く破損させる。
    const params: GoldfishParams = { ...P, paperDurability: 8, fishCount: 1, fishCruiseSpeed: 0, fishFleeSpeed: 0 }
    const s = new GoldfishSession({ params, seed: 1 })
    const target = { x: 0, z: 0 }
    let allEvents: GoldfishEvent[] = []
    for (let i = 0; i < 200 && s.currentStatus === 'playing'; i++) {
      allEvents = [...allEvents, ...s.update(DT, { target, submerge: true })]
    }
    expect(s.currentStatus).toBe('torn')
    expect(allEvents.some((e) => e.type === 'poi-torn')).toBe(true)
    const finished = allEvents.find((e) => e.type === 'finished')
    expect(finished).toEqual({ type: 'finished', reason: 'torn', caught: 0 })
    // 終了後は update が no-op(イベント無し)。
    expect(s.update(DT, { target, submerge: true })).toEqual([])
  })

  it('破損時、ポイに乗っていた金魚は水槽へ戻る(GDD §4.4)', () => {
    const params: GoldfishParams = { ...P, paperDurability: 20, fishCount: 1, fishCruiseSpeed: 0, fishFleeSpeed: 0 }
    const s = new GoldfishSession({ params, seed: 1 })
    // まず捕獲。
    const target = s.fishStates[0].position
    for (let i = 0; i < 100; i++) s.update(DT, { target, submerge: false })
    s.update(DT, { target, submerge: true })
    s.update(DT, { target, submerge: false }) // capture(fishWeightDamage 12pt)
    expect(s.fishStates[0].status).toBe('onPoi')
    // 水中静止で残り耐久を削って破損させる。
    for (let i = 0; i < 200 && s.currentStatus === 'playing'; i++) {
      s.update(DT, { target, submerge: true })
    }
    expect(s.currentStatus).toBe('torn')
    expect(s.fishStates[0].status).toBe('swimming') // 水槽へ戻った
  })

  it('AC8(d): 時間切れで timeout 終了。確保0なら timeout、確保ありなら won', () => {
    // 確保0 → timeout。
    const a = new GoldfishSession({ seed: 1 })
    const target = { x: 0, z: 0 }
    let aEvents: GoldfishEvent[] = []
    // 60s = 3600 フレーム。少し多めに回す。
    for (let i = 0; i < 3700 && a.currentStatus === 'playing'; i++) {
      aEvents = [...aEvents, ...a.update(DT, { target, submerge: false })]
    }
    expect(a.currentStatus).toBe('timeout')
    const aFin = aEvents.find((e) => e.type === 'finished')
    expect(aFin).toEqual({ type: 'finished', reason: 'timeout', caught: 0 })

    // 確保あり → won(reason は timeout)。
    const params: GoldfishParams = { ...P, fishCount: 1, fishCruiseSpeed: 0, fishFleeSpeed: 0 }
    const b = new GoldfishSession({ params, seed: 1 })
    const f = b.fishStates[0].position
    for (let i = 0; i < 100; i++) b.update(DT, { target: f, submerge: false })
    b.update(DT, { target: f, submerge: true })
    b.update(DT, { target: f, submerge: false }) // capture
    b.update(DT, { target: f, submerge: false, secure: true }) // secure → secured=1
    expect(b.securedCount).toBe(1)
    let bEvents: GoldfishEvent[] = []
    for (let i = 0; i < 3700 && b.currentStatus === 'playing'; i++) {
      bEvents = [...bEvents, ...b.update(DT, { target: f, submerge: false })]
    }
    expect(b.currentStatus).toBe('won')
    const bFin = bEvents.find((e) => e.type === 'finished')
    expect(bFin).toEqual({ type: 'finished', reason: 'timeout', caught: 1 })
  })

  it('quit 入力で即終了(status=quit, finished{quit})', () => {
    const s = new GoldfishSession({ seed: 1 })
    const events = s.update(DT, { target: { x: 0, z: 0 }, submerge: false, quit: true })
    expect(s.currentStatus).toBe('quit')
    expect(events.find((e) => e.type === 'finished')).toEqual({
      type: 'finished',
      reason: 'quit',
      caught: 0,
    })
  })

  it('AC7: 耐久警告(残30以下・初回のみ)paper-warning が一度だけ出る', () => {
    const s = new GoldfishSession({ seed: 1 })
    const target = { x: 0, z: 0 }
    let warnings = 0
    for (let i = 0; i < 3600 && s.currentStatus === 'playing'; i++) {
      const events = s.update(DT, { target, submerge: true }) // 水中静止で 4pt/s ずつ減る
      warnings += events.filter((e) => e.type === 'paper-warning').length
    }
    // 100pt → 4pt/s。70pt 消費(=残30)までに 1 回だけ警告。
    expect(warnings).toBe(1)
  })

  it('snapshot/公開状態が T-006 描画に必要な値を返す', () => {
    const s = new GoldfishSession({ seed: 1 })
    const snap = s.snapshot()
    expect(snap.status).toBe('playing')
    expect(snap.timeRemaining).toBe(P.sessionTimeLimit)
    expect(snap.poi.position).toEqual({ x: 0, z: 0 })
    expect(snap.fish).toHaveLength(P.fishCount)
    expect(snap.secured).toBe(0)
    expect(snap.caughtTotal).toBe(0)
    // getter 群も一致。
    expect(s.poiState.durability).toBe(snap.poi.durability)
    expect(s.fishStates).toHaveLength(P.fishCount)
  })

  it('決定論: 同じ seed + 同じ入力列なら同じ最終状態(再現可能)', () => {
    function run(): string {
      const s = new GoldfishSession({ seed: 99 })
      const inputs: GoldfishInput[] = []
      for (let i = 0; i < 300; i++) {
        inputs.push({ target: { x: Math.sin(i / 20) * 0.3, z: Math.cos(i / 17) * 0.2 }, submerge: i % 40 < 20 })
      }
      for (const input of inputs) s.update(DT, input)
      return JSON.stringify(s.snapshot())
    }
    expect(run()).toBe(run())
  })
})
