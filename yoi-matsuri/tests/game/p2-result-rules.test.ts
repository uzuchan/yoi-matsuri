import { describe, expect, it } from 'vitest'
import {
  resolveStallResult,
  SUPERBALL_RESULT_RULES,
  MASK_RESULT_RULES,
} from '../../src/game/result'

/**
 * P2 量産屋台(スーパーボール / お面)の結果規則の段境界・reason 分岐を固定する(§5.2 / §4)。
 * 文言・報酬・境界の正は各 *Result.ts(コードに散らさない)。ここでは tier 解決の挙動を保証する。
 */

describe('スーパーボールすくいの結果(SCOOP / 数を要求)', () => {
  it('境界: 0=失敗 / 2〜4=成功 / 5以上=大成功(金魚より高い境界)', () => {
    expect(resolveStallResult({ score: 0, reason: 'timeout' }, SUPERBALL_RESULT_RULES).tier).toBe('fail')
    expect(resolveStallResult({ score: 1, reason: 'timeout' }, SUPERBALL_RESULT_RULES).tier).toBe('fail')
    expect(resolveStallResult({ score: 2, reason: 'success' }, SUPERBALL_RESULT_RULES).tier).toBe('success')
    expect(resolveStallResult({ score: 4, reason: 'success' }, SUPERBALL_RESULT_RULES).tier).toBe('success')
    expect(resolveStallResult({ score: 5, reason: 'success' }, SUPERBALL_RESULT_RULES).tier).toBe('great')
  })

  it('失敗段は reason で見出しが分岐(破損 vs 時間切れ)・必ず残念賞を返す', () => {
    const broke = resolveStallResult({ score: 0, reason: 'broke' }, SUPERBALL_RESULT_RULES)
    const timeout = resolveStallResult({ score: 0, reason: 'timeout' }, SUPERBALL_RESULT_RULES)
    expect(broke.heading).not.toBe(timeout.heading)
    expect(broke.reward.id).toBe('reward:superball:consolation') // 手ぶらにしない(§4)
  })

  it('大成功はレア報酬を返す', () => {
    const great = resolveStallResult({ score: 6, reason: 'success' }, SUPERBALL_RESULT_RULES)
    expect(great.reward.id).toBe('reward:superball:many')
  })
})

describe('お面屋の結果(CHOICE / 選べた=成功・希少=大成功・失敗概念なし)', () => {
  it('境界: 0=fail(退出のみ) / 1=成功 / 2=大成功(希少)', () => {
    expect(resolveStallResult({ score: 0, reason: 'quit' }, MASK_RESULT_RULES).tier).toBe('fail')
    expect(resolveStallResult({ score: 1, reason: 'success' }, MASK_RESULT_RULES).tier).toBe('success')
    expect(resolveStallResult({ score: 2, reason: 'success' }, MASK_RESULT_RULES).tier).toBe('great')
  })

  it('選んだら報酬(お面)を返す。大成功は般若', () => {
    expect(resolveStallResult({ score: 1, reason: 'success' }, MASK_RESULT_RULES).reward.id).toBe(
      'reward:mask:chosen',
    )
    expect(resolveStallResult({ score: 2, reason: 'success' }, MASK_RESULT_RULES).reward.id).toBe(
      'reward:mask:hannya',
    )
  })

  it('退出(quit)は失敗感を出さない穏当な見出し+手ぶら防止の残念賞', () => {
    const quit = resolveStallResult({ score: 0, reason: 'quit' }, MASK_RESULT_RULES)
    expect(quit.heading).toBe('またね')
    expect(quit.reward.id).toBe('reward:mask:none')
  })
})
