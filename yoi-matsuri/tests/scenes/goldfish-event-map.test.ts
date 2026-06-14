import { describe, expect, it } from 'vitest'
import type { GoldfishEvent } from '../../src/game/goldfish'
import {
  mapGoldfishEvent,
  mapGoldfishEvents,
  mapSubmergeEdge,
  type EmitInstruction,
} from '../../src/scenes/goldfish/eventMap'

/**
 * GoldfishEvent → EventBus/sfx 写像(純TS)の unit test(T-006 AC7 / Risk(2))。
 * 写像の正しさと「二重発火しない/取りこぼさない」を固定する。
 */

/** 指示を "event:name" の文字列へ畳んで比較しやすくする。 */
function flatten(instructions: readonly EmitInstruction[]): string[] {
  return instructions.map((ins) => {
    if (ins.event === 'sfx:play') return `sfx:${ins.payload.name}`
    if (ins.event === 'goldfish:caught') return `goldfish:caught(${ins.payload.total})`
    if (ins.event === 'goldfish:poi-torn') return 'goldfish:poi-torn'
    return `goldfish:finished(${ins.payload.caught},${ins.payload.reason})`
  })
}

describe('mapSubmergeEdge', () => {
  it('false→true(沈める立ち上がり)で poi-dip', () => {
    expect(flatten(mapSubmergeEdge(false, true))).toEqual(['sfx:poi-dip'])
  })
  it('true→false(持ち上げ立ち下がり)で poi-lift', () => {
    expect(flatten(mapSubmergeEdge(true, false))).toEqual(['sfx:poi-lift'])
  })
  it('変化なし(false→false)は何も出さない', () => {
    expect(mapSubmergeEdge(false, false)).toEqual([])
  })
  it('変化なし(true→true)は何も出さない(沈め継続で dip を連発しない)', () => {
    expect(mapSubmergeEdge(true, true)).toEqual([])
  })
})

describe('mapGoldfishEvent', () => {
  it('caught → sfx catch + goldfish:caught{total}', () => {
    const ev: GoldfishEvent = { type: 'caught', total: 2, fishId: 3 }
    expect(flatten(mapGoldfishEvent(ev))).toEqual(['sfx:catch', 'goldfish:caught(2)'])
  })
  it('secured → sfx secure(GameEvents は出さない)', () => {
    const ev: GoldfishEvent = { type: 'secured', secured: 1, fishId: 0 }
    expect(flatten(mapGoldfishEvent(ev))).toEqual(['sfx:secure'])
  })
  it('fish-escape → sfx fish-escape', () => {
    const ev: GoldfishEvent = { type: 'fish-escape', fishId: 1 }
    expect(flatten(mapGoldfishEvent(ev))).toEqual(['sfx:fish-escape'])
  })
  it('paper-warning → sfx paper-warning', () => {
    const ev: GoldfishEvent = { type: 'paper-warning' }
    expect(flatten(mapGoldfishEvent(ev))).toEqual(['sfx:paper-warning'])
  })
  it('poi-torn → sfx paper-tear + goldfish:poi-torn', () => {
    const ev: GoldfishEvent = { type: 'poi-torn' }
    expect(flatten(mapGoldfishEvent(ev))).toEqual(['sfx:paper-tear', 'goldfish:poi-torn'])
  })
  it('finished → goldfish:finished{caught,reason}(sfx は出さない)', () => {
    const ev: GoldfishEvent = { type: 'finished', reason: 'timeout', caught: 3 }
    expect(flatten(mapGoldfishEvent(ev))).toEqual(['goldfish:finished(3,timeout)'])
  })
})

describe('mapGoldfishEvents(配列)', () => {
  it('順序を保って写像し、各イベントを 1 回ずつだけ出す(二重発火しない)', () => {
    const events: GoldfishEvent[] = [
      { type: 'caught', total: 1, fishId: 0 },
      { type: 'caught', total: 2, fishId: 1 },
      { type: 'paper-warning' },
      { type: 'poi-torn' },
      { type: 'finished', reason: 'torn', caught: 0 },
    ]
    expect(flatten(mapGoldfishEvents(events))).toEqual([
      'sfx:catch',
      'goldfish:caught(1)',
      'sfx:catch',
      'goldfish:caught(2)',
      'sfx:paper-warning',
      'sfx:paper-tear',
      'goldfish:poi-torn',
      'goldfish:finished(0,torn)',
    ])
  })

  it('空配列は空を返す', () => {
    expect(mapGoldfishEvents([])).toEqual([])
  })

  it('同じ caught が複数(複数同時捕獲)でも個別に写像する', () => {
    const events: GoldfishEvent[] = [
      { type: 'caught', total: 1, fishId: 0 },
      { type: 'caught', total: 2, fishId: 1 },
    ]
    const out = flatten(mapGoldfishEvents(events))
    expect(out.filter((s) => s === 'sfx:catch')).toHaveLength(2)
    expect(out).toContain('goldfish:caught(1)')
    expect(out).toContain('goldfish:caught(2)')
  })
})
