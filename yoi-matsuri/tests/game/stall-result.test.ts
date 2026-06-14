import { describe, expect, it } from 'vitest'
import {
  resolveStallResult,
  tierForScore,
  type StallResultRules,
} from '../../src/game/result'
import type { StallResult } from '../../src/game/stall'

/**
 * resolveStallResult / tierForScore の汎用解決テスト(StallFramework §5.2 / §8.2)。
 * 屋台が供給した StallResultRules に基づき、score→tier 境界と reason 分岐(失敗段のみ)を固定する。
 */

const RULES: StallResultRules = {
  thresholds: { success: 2, great: 5 },
  headings: { success: '成功!', great: '大成功!' },
  shopkeeperLines: { success: 'やるね', great: '名人!' },
  failByReason: {
    success: { heading: 'fail-success', line: 'l-success' },
    timeout: { heading: '時間切れ', line: '時間だ' },
    broke: { heading: '壊れた', line: 'こわれた' },
    quit: { heading: 'やめた', line: 'またな' },
  },
  rewardByTier: {
    fail: { id: 'r:fail', name: 'はずれ', icon: '🥲' },
    success: { id: 'r:ok', name: 'あたり', icon: '🎁' },
    great: { id: 'r:great', name: '大あたり', icon: '🏆' },
  },
}

const result = (score: number, reason: StallResult['reason']): StallResult => ({ score, reason })

describe('tierForScore(屋台ごとの境界 / §5.2)', () => {
  it('score < success は fail', () => {
    expect(tierForScore(0, RULES)).toBe('fail')
    expect(tierForScore(1, RULES)).toBe('fail')
  })
  it('success <= score < great は success', () => {
    expect(tierForScore(2, RULES)).toBe('success')
    expect(tierForScore(4, RULES)).toBe('success')
  })
  it('great <= score は great', () => {
    expect(tierForScore(5, RULES)).toBe('great')
    expect(tierForScore(99, RULES)).toBe('great')
  })
  it('負数・非整数・NaN は安全に 0(fail)へ丸める', () => {
    expect(tierForScore(-3, RULES)).toBe('fail')
    expect(tierForScore(1.9, RULES)).toBe('fail')
    expect(tierForScore(Number.NaN, RULES)).toBe('fail')
  })
})

describe('resolveStallResult(段・見出し・セリフ・報酬 / §5.2)', () => {
  it('成功段は reason 非依存で headings/shopkeeperLines/報酬を返す', () => {
    for (const reason of ['success', 'timeout', 'broke', 'quit'] as const) {
      const o = resolveStallResult(result(3, reason), RULES)
      expect(o.tier).toBe('success')
      expect(o.score).toBe(3)
      expect(o.heading).toBe('成功!')
      expect(o.shopkeeperLine).toBe('やるね')
      expect(o.reward.id).toBe('r:ok')
    }
  })

  it('大成功段は reason 非依存', () => {
    const o = resolveStallResult(result(6, 'broke'), RULES)
    expect(o.tier).toBe('great')
    expect(o.heading).toBe('大成功!')
    expect(o.reward.id).toBe('r:great')
  })

  it('失敗段は reason で見出し・セリフが分岐する(報酬は段で固定)', () => {
    const broke = resolveStallResult(result(0, 'broke'), RULES)
    expect(broke.heading).toBe('壊れた')
    expect(broke.shopkeeperLine).toBe('こわれた')
    expect(broke.reward.id).toBe('r:fail')

    const timeout = resolveStallResult(result(0, 'timeout'), RULES)
    expect(timeout.heading).toBe('時間切れ')
    expect(timeout.reward.id).toBe('r:fail')

    expect(broke.heading).not.toBe(timeout.heading)
  })

  it('不正な reason は破損(broke)へ丸める', () => {
    const o = resolveStallResult({ score: 0, reason: 'bogus' as never }, RULES)
    expect(o.heading).toBe('壊れた')
  })
})
