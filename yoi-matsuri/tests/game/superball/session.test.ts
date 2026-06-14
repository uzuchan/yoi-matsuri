import { describe, expect, it } from 'vitest'
import {
  SuperballSession,
  DEFAULT_SUPERBALL_PARAMS,
  SUPERBALL_POI_PARAMS,
  type SuperballParams,
  type SuperballState,
} from '../../../src/game/superball'

/**
 * SuperballSession の固定(MINIGAME_ARCHETYPES 原型A SCOOP / 屋台#1)。
 * ポイ物理は金魚の Poi を再利用しているため、捕獲/こぼれ/破損の手触りは金魚と同型であることを確認する。
 * 乱数は seeded(決定論)で再現可能(§7 厳守)。
 */

const DT = 1 / 60

/** 漂い・弾みを止めた静止ボール 1 個のセッション(捕獲メカニクスの純粋検証用)。 */
function stillBallSession(overrides: Partial<SuperballParams> = {}): SuperballSession {
  const params: SuperballParams = {
    ...DEFAULT_SUPERBALL_PARAMS,
    ballCount: 1,
    driftSpeed: 0, // 漂わない(位置を固定して捕獲判定を切り出す)
    bobAmplitude: 0,
    ...overrides,
  }
  return new SuperballSession({ params, seed: 1 })
}

function ballPos(s: SuperballSession): { x: number; z: number } {
  return s.snapshot().balls[0].position
}

/** ポイをゆっくりボール位置へ寄せて co-locate する(submerge=false で接近=低速・耐久温存)。 */
function approachBall(s: SuperballSession): void {
  const target = ballPos(s)
  for (let i = 0; i < 400; i++) {
    s.update(DT, { target, submerge: false, secure: false, quit: false })
  }
}

describe('SuperballSession 捕獲判定(SCOOP / poi 物理再利用)', () => {
  it('liftSpeedMax 以下の持ち上げで捕獲成立(caught・確保前は onPoi)', () => {
    const s = stillBallSession()
    approachBall(s)
    const target = ballPos(s)
    s.update(DT, { target, submerge: true })
    const events = s.update(DT, { target, submerge: false })
    const caught = events.filter((e) => e.type === 'caught')
    expect(caught).toHaveLength(1)
    expect(s.snapshot().balls[0].status).toBe('onPoi')
    expect(s.snapshot().secured).toBe(0)
  })

  it('捕獲時にボール荷重ダメージ(fishWeightDamage)が 1 回入る', () => {
    const s = stillBallSession()
    approachBall(s)
    const durBefore = s.snapshot().poi.durability
    const target = ballPos(s)
    s.update(DT, { target, submerge: true })
    s.update(DT, { target, submerge: false })
    expect(durBefore - s.snapshot().poi.durability).toBeGreaterThanOrEqual(
      SUPERBALL_POI_PARAMS.fishWeightDamage,
    )
  })

  it('liftSpeedMax 超過の速い持ち上げはこぼれる(ball-spill・耐久ダメージなし)', () => {
    const s = stillBallSession()
    approachBall(s)
    s.update(DT, { target: ballPos(s), submerge: true })
    const durBefore = s.snapshot().poi.durability
    const fastSpeed = 0.6 // > liftSpeedMax(0.42)
    const stepDist = fastSpeed * DT
    const alphaAir = 1 - Math.exp(-DT / SUPERBALL_POI_PARAMS.poiFollowLag)
    const cur = s.snapshot().poi.position
    const aim = { x: cur.x + stepDist / alphaAir, z: cur.z }
    const events = s.update(DT, { target: aim, submerge: false })
    expect(s.snapshot().poi.speed).toBeGreaterThan(SUPERBALL_POI_PARAMS.liftSpeedMax)
    expect(events.some((e) => e.type === 'ball-spill')).toBe(true)
    expect(s.snapshot().balls[0].status).toBe('floating')
    // こぼれ(速度超過)では耐久ダメージはない(金魚と同方針)。
    expect(s.snapshot().poi.durability).toBe(durBefore)
  })

  it('お椀の上で secure するとお椀へ確保され secured が増える(= score)', () => {
    const s = stillBallSession()
    approachBall(s)
    const target = ballPos(s)
    s.update(DT, { target, submerge: true })
    s.update(DT, { target, submerge: false }) // capture → onPoi
    expect(s.snapshot().balls[0].status).toBe('onPoi')
    const events = s.update(DT, { target, submerge: false, secure: true })
    expect(events.some((e) => e.type === 'secured')).toBe(true)
    expect(s.snapshot().secured).toBe(1)
    expect(s.snapshot().score).toBe(1)
    expect(s.snapshot().balls[0].status).toBe('secured')
  })
})

describe('SuperballSession 終了とステータス(StallSession 契約)', () => {
  it('速く沈めて動かし続けると紙が破れて failed 終了(score=確保数, reason=broke)', () => {
    const s = stillBallSession()
    let broke = false
    let result: SuperballState | null = null
    for (let i = 0; i < 600 && !broke; i++) {
      // 沈めたまま大きく往復(speed² で耐久を削る)。
      const x = i % 2 === 0 ? 0.4 : -0.4
      const events = s.update(DT, { target: { x, z: 0 }, submerge: true })
      result = s.snapshot()
      if (events.some((e) => e.type === 'poi-torn')) broke = true
    }
    expect(broke).toBe(true)
    expect(s.status).toBe('failed')
    expect(s.result()).not.toBeNull()
    expect(s.result()!.reason).toBe('broke')
    expect(result!.poi.durability).toBe(0)
  })

  it('時間切れで終了(0個なら timeout / 確保ありなら cleared)', () => {
    const s = stillBallSession({ sessionTimeLimit: 0.5 })
    let finished = false
    for (let i = 0; i < 120 && !finished; i++) {
      const events = s.update(DT, { target: { x: 0, z: 0 }, submerge: false })
      if (events.some((e) => e.type === 'stall-finished')) finished = true
    }
    expect(finished).toBe(true)
    expect(s.status).toBe('timeout')
    expect(s.result()!.score).toBe(0)
    expect(s.result()!.reason).toBe('timeout')
  })

  it('quit で即終了(status=quit, score=0)', () => {
    const s = stillBallSession()
    const events = s.update(DT, { target: { x: 0, z: 0 }, submerge: false, quit: true })
    expect(events.some((e) => e.type === 'stall-finished')).toBe(true)
    expect(s.status).toBe('quit')
    expect(s.result()!.reason).toBe('quit')
    // 終了後の update は何もしない。
    expect(s.update(DT, { target: { x: 0, z: 0 }, submerge: false })).toEqual([])
  })

  it('耐久 30 以下に初めて到達で paper-warning が 1 回だけ出る(破損予兆 §0-4)', () => {
    const s = stillBallSession()
    let warnings = 0
    for (let i = 0; i < 600; i++) {
      if (s.status !== 'playing') break
      const x = i % 2 === 0 ? 0.4 : -0.4
      const events = s.update(DT, { target: { x, z: 0 }, submerge: true })
      warnings += events.filter((e) => e.type === 'paper-warning').length
    }
    expect(warnings).toBe(1)
  })
})

describe('SuperballSession ボール挙動(金魚と異なる = 逃げない)', () => {
  it('ボールはポイが近づいても逃げない(漂うだけ・onPoi 化できる)', () => {
    // drift を残したセッションでも、ポイに寄せれば捕獲できる(回避行動がない証拠)。
    const s = new SuperballSession({
      params: { ...DEFAULT_SUPERBALL_PARAMS, ballCount: 1, driftSpeed: 0 },
      seed: 7,
    })
    approachBall(s)
    const target = ballPos(s)
    s.update(DT, { target, submerge: true })
    s.update(DT, { target, submerge: false })
    expect(s.snapshot().balls[0].status).toBe('onPoi')
  })

  it('決定論: 同一 seed なら同一のボール初期配置になる(seeded / §7)', () => {
    const a = new SuperballSession({ seed: 42 })
    const b = new SuperballSession({ seed: 42 })
    const pa = a.snapshot().balls.map((x) => `${x.position.x.toFixed(6)},${x.position.z.toFixed(6)}`)
    const pb = b.snapshot().balls.map((x) => `${x.position.x.toFixed(6)},${x.position.z.toFixed(6)}`)
    expect(pa).toEqual(pb)
    // 異なる seed では配置が変わる。
    const c = new SuperballSession({ seed: 99 })
    const pc = c.snapshot().balls.map((x) => `${x.position.x.toFixed(6)},${x.position.z.toFixed(6)}`)
    expect(pc).not.toEqual(pa)
  })

  it('ボールは楕円水槽内に留まる(境界で跳ね返る)', () => {
    const s = new SuperballSession({ seed: 3 }) // drift あり(既定値)
    const bounds = { rx: 0.6, rz: 0.45 }
    for (let i = 0; i < 1200; i++) {
      s.update(DT, { target: { x: 0, z: 0 }, submerge: false })
    }
    for (const b of s.snapshot().balls) {
      const n = (b.position.x / bounds.rx) ** 2 + (b.position.z / bounds.rz) ** 2
      expect(n).toBeLessThanOrEqual(1.05) // 縁の僅か内側に収まる
    }
  })
})
