import { describe, expect, it } from 'vitest'
import { MaskSession, MASK_KINDS, type MaskInput } from '../../../src/game/mask'

/**
 * MaskSession の固定(CHOICE 原型 / 屋台#19)。物理なし・決定論(乱数なし)。
 * フォーカス移動 / 確定 / 結果(選べた=成功 / 希少=大成功 / 退出=quit)を固定する。
 */

const DT = 1 / 60
const noInput: MaskInput = { move: 0, focusIndex: null }

/** 希少枠(般若)の index を取得(テストの可読性)。 */
const RARE_INDEX = MASK_KINDS.findIndex((m) => m.rare)
const NORMAL_INDEX = MASK_KINDS.findIndex((m) => !m.rare)

describe('MaskSession フォーカス移動(←→ / ポインタ)', () => {
  it('move=+1 で右へ、循環する', () => {
    const s = new MaskSession()
    expect(s.snapshot().focusedIndex).toBe(0)
    s.update(DT, { move: 1, focusIndex: null })
    expect(s.snapshot().focusedIndex).toBe(1)
  })

  it('move=-1 で先頭から末尾へ循環する', () => {
    const s = new MaskSession()
    s.update(DT, { move: -1, focusIndex: null })
    expect(s.snapshot().focusedIndex).toBe(MASK_KINDS.length - 1)
  })

  it('focusIndex 指定で直接フォーカスし focus-changed を出す(ポインタ経路)', () => {
    const s = new MaskSession()
    const events = s.update(DT, { move: 0, focusIndex: 2 })
    expect(s.snapshot().focusedIndex).toBe(2)
    expect(events.some((e) => e.type === 'focus-changed')).toBe(true)
  })

  it('同じ index への移動では focus-changed を出さない(無音)', () => {
    const s = new MaskSession()
    const events = s.update(DT, { move: 0, focusIndex: 0 })
    expect(events.some((e) => e.type === 'focus-changed')).toBe(false)
  })
})

describe('MaskSession 確定と結果(選べた=成功 / 希少=大成功 / §1 CHOICE)', () => {
  it('通常のお面を選ぶと成功(score=1, reason=success, cleared)', () => {
    const s = new MaskSession()
    s.update(DT, { move: 0, focusIndex: NORMAL_INDEX })
    const events = s.update(DT, { move: 0, focusIndex: NORMAL_INDEX, confirm: true })
    expect(events.some((e) => e.type === 'chosen')).toBe(true)
    expect(events.some((e) => e.type === 'stall-finished')).toBe(true)
    expect(s.status).toBe('cleared')
    const r = s.result()!
    expect(r.score).toBe(1)
    expect(r.reason).toBe('success')
    expect(r.metrics?.chosenIndex).toBe(NORMAL_INDEX)
  })

  it('希少なお面(般若)を選ぶと大成功相当(score=2)', () => {
    const s = new MaskSession()
    const events = s.update(DT, { move: 0, focusIndex: RARE_INDEX, confirm: true })
    expect(events.some((e) => e.type === 'chosen')).toBe(true)
    expect(s.status).toBe('cleared')
    expect(s.result()!.score).toBe(2)
    expect(s.snapshot().chosenIndex).toBe(RARE_INDEX)
  })

  it('chosen イベントは選んだ maskId を運ぶ', () => {
    const s = new MaskSession()
    const events = s.update(DT, { move: 0, focusIndex: 1, confirm: true })
    const chosen = events.find((e) => e.type === 'chosen')
    expect(chosen && chosen.type === 'chosen' && chosen.maskId).toBe(MASK_KINDS[1].id)
  })

  it('退出(quit)は選ばずに終了(status=quit, score=0)', () => {
    const s = new MaskSession()
    const events = s.update(DT, { ...noInput, quit: true })
    expect(events.some((e) => e.type === 'stall-finished')).toBe(true)
    expect(s.status).toBe('quit')
    expect(s.result()!.score).toBe(0)
    expect(s.result()!.reason).toBe('quit')
    expect(s.snapshot().chosenIndex).toBe(-1)
  })

  it('確定後の update は何もしない(終了状態)', () => {
    const s = new MaskSession()
    s.update(DT, { move: 0, focusIndex: 0, confirm: true })
    expect(s.update(DT, { move: 1, focusIndex: null })).toEqual([])
    // フォーカスが動かない(終了済み)。
    expect(s.snapshot().focusedIndex).toBe(0)
  })
})

describe('MaskSession スナップショット契約(StallSnapshot)', () => {
  it('制限時間なし(timeRemaining<0)・危険度なし(danger=0)', () => {
    const s = new MaskSession()
    const snap = s.snapshot()
    expect(snap.timeRemaining).toBeLessThan(0)
    expect(snap.danger).toBe(0)
    expect(snap.count).toBe(MASK_KINDS.length)
  })

  it('お面候補は 4〜6 種(タスク要件)', () => {
    expect(MASK_KINDS.length).toBeGreaterThanOrEqual(4)
    expect(MASK_KINDS.length).toBeLessThanOrEqual(6)
  })
})
