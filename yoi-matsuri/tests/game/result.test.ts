import { describe, expect, it } from 'vitest'
import {
  resolveResult,
  tierForCaught,
  REWARDS,
  SHOPKEEPER,
  SUCCESS_THRESHOLD,
  GREAT_THRESHOLD,
} from '../../src/game/result'

/**
 * 結果の報酬段判定(T-007 / GDD §3.2・INTERACTION_SPEC §4)の unit test。
 * three/react/DOM 非依存の純TS。境界(0/1/2/3)を固定し、見出し・店主セリフ・報酬IDが
 * ドキュメントの正文どおりであることを検証する(段判定は reason に依らず secured 数 = GDD §3.2)。
 */

// GDD §3.2 v1.2 / INTERACTION_SPEC §4 の正文(文言の改変検知のため、テストにも直書きして突き合わせる)。
// 失敗段(0匹)の見出し・店主セリフは終了理由(reason)で分岐する。
const HEADING_FAIL_TORN = 'ポイが破れてしまった…'
const HEADING_FAIL_NOSCOOP = 'すくえなかった…'
const HEADING_SUCCESS = '金魚をすくった!'
const HEADING_GREAT = '大漁!名人級!'
const LINE_FAIL_TORN =
  'ありゃー、破れちまったか。まあ祭りの夜は長いんだ、また挑戦しな!'
const LINE_FAIL_NOSCOOP = 'おっと時間だ。今日はご縁がなかったか。…また挑戦しな!'
const LINE_SUCCESS = 'おっ、やるねえ!ほら、大事にしてやんなよ。'
const LINE_GREAT = 'うおっ、名人かい!?こりゃあ参った、特別だ!'

describe('tierForCaught(段判定の境界 / GDD §3.2)', () => {
  it('0 匹は失敗(fail)', () => {
    expect(tierForCaught(0)).toBe('fail')
  })

  it('1 匹は成功(success)= 境界 SUCCESS_THRESHOLD', () => {
    expect(SUCCESS_THRESHOLD).toBe(1)
    expect(tierForCaught(1)).toBe('success')
  })

  it('2 匹は成功(success)= 大成功の手前', () => {
    expect(tierForCaught(2)).toBe('success')
  })

  it('3 匹は大成功(great)= 境界 GREAT_THRESHOLD', () => {
    expect(GREAT_THRESHOLD).toBe(3)
    expect(tierForCaught(3)).toBe('great')
  })

  it('4 匹以上も大成功(great)', () => {
    expect(tierForCaught(4)).toBe('great')
    expect(tierForCaught(8)).toBe('great')
  })

  it('負数・非整数・NaN は安全に 0 匹(fail)へ丸める', () => {
    expect(tierForCaught(-1)).toBe('fail')
    expect(tierForCaught(0.9)).toBe('fail') // 0 へ floor → fail
    expect(tierForCaught(1.9)).toBe('success') // 1 へ floor → success
    expect(tierForCaught(Number.NaN)).toBe('fail')
  })
})

describe('resolveResult(見出し・店主セリフ・報酬 / GDD §3.2・INTERACTION_SPEC §4)', () => {
  it('0 匹 = 失敗(reason 既定=torn): 見出し・店主セリフ・報酬 candy', () => {
    // 後方互換: reason 省略は破損(torn)扱い。
    const r = resolveResult(0)
    expect(r.tier).toBe('fail')
    expect(r.caught).toBe(0)
    expect(r.heading).toBe(HEADING_FAIL_TORN)
    expect(r.shopkeeperLine).toBe(LINE_FAIL_TORN)
    expect(r.reward.id).toBe('reward:candy')
    expect(r.reward).toEqual(REWARDS['reward:candy'])
  })

  it('1 匹 = 成功: 見出し・店主セリフ・報酬 bag-small', () => {
    const r = resolveResult(1)
    expect(r.tier).toBe('success')
    expect(r.caught).toBe(1)
    expect(r.heading).toBe(HEADING_SUCCESS)
    expect(r.shopkeeperLine).toBe(LINE_SUCCESS)
    expect(r.reward.id).toBe('reward:bag-small')
  })

  it('2 匹 = 成功(同じ段・同じ報酬)', () => {
    const r = resolveResult(2)
    expect(r.tier).toBe('success')
    expect(r.caught).toBe(2)
    expect(r.reward.id).toBe('reward:bag-small')
  })

  it('3 匹 = 大成功: 見出し・店主セリフ・報酬 bag-deluxe', () => {
    const r = resolveResult(3)
    expect(r.tier).toBe('great')
    expect(r.caught).toBe(3)
    expect(r.heading).toBe(HEADING_GREAT)
    expect(r.shopkeeperLine).toBe(LINE_GREAT)
    expect(r.reward.id).toBe('reward:bag-deluxe')
  })

  it('報酬は表示情報(名前・アイコン)を持つ(所持品スロット表示用)', () => {
    expect(REWARDS['reward:candy'].name).toBe('ラムネ風アメ')
    expect(REWARDS['reward:bag-small'].name).toBe('金魚袋')
    expect(REWARDS['reward:bag-deluxe'].name).toBe('大きな金魚袋+出目金')
    for (const id of Object.keys(REWARDS) as (keyof typeof REWARDS)[]) {
      expect(REWARDS[id].icon.length).toBeGreaterThan(0)
    }
  })

  it('話者は「店主」(GDD §3.2)', () => {
    expect(SHOPKEEPER).toBe('店主')
  })
})

describe('resolveResult — 失敗段(0匹)の reason 分岐(GDD §3.2 v1.2)', () => {
  it('secured=0 × torn(破損): 「ポイが破れてしまった…」+ 破損セリフ', () => {
    const r = resolveResult(0, 'torn')
    expect(r.tier).toBe('fail')
    expect(r.caught).toBe(0)
    expect(r.heading).toBe(HEADING_FAIL_TORN)
    expect(r.shopkeeperLine).toBe(LINE_FAIL_TORN)
    expect(r.reward.id).toBe('reward:candy')
  })

  it('secured=0 × timeout(時間切れ): 「すくえなかった…」+ 時間切れセリフ', () => {
    const r = resolveResult(0, 'timeout')
    expect(r.tier).toBe('fail')
    expect(r.heading).toBe(HEADING_FAIL_NOSCOOP)
    expect(r.shopkeeperLine).toBe(LINE_FAIL_NOSCOOP)
    expect(r.reward.id).toBe('reward:candy') // 報酬は reason 非依存
  })

  it('secured=0 × quit(途中退出): timeout と同じ「すくえなかった…」+ 同セリフ', () => {
    const r = resolveResult(0, 'quit')
    expect(r.tier).toBe('fail')
    expect(r.heading).toBe(HEADING_FAIL_NOSCOOP)
    expect(r.shopkeeperLine).toBe(LINE_FAIL_NOSCOOP)
    expect(r.reward.id).toBe('reward:candy')
  })

  it('torn と timeout/quit で失敗見出しは別文言(破れていないのに「破れた」と出ない)', () => {
    expect(resolveResult(0, 'torn').heading).not.toBe(resolveResult(0, 'timeout').heading)
    expect(resolveResult(0, 'timeout').heading).toBe(resolveResult(0, 'quit').heading)
  })

  it('成功段(1〜2匹)は reason 非依存: torn でも「金魚をすくった!」+ 成功セリフ', () => {
    for (const reason of ['torn', 'timeout', 'quit'] as const) {
      const r = resolveResult(2, reason)
      expect(r.tier).toBe('success')
      expect(r.heading).toBe(HEADING_SUCCESS)
      expect(r.shopkeeperLine).toBe(LINE_SUCCESS)
    }
  })

  it('大成功段(3匹以上)は reason 非依存: torn でも「大漁!名人級!」+ 大成功セリフ', () => {
    for (const reason of ['torn', 'timeout', 'quit'] as const) {
      const r = resolveResult(3, reason)
      expect(r.tier).toBe('great')
      expect(r.heading).toBe(HEADING_GREAT)
      expect(r.shopkeeperLine).toBe(LINE_GREAT)
    }
  })

  it('不正な reason は破損(torn)へ丸める(後方互換・安全)', () => {
    const r = resolveResult(0, 'bogus' as unknown as 'torn')
    expect(r.heading).toBe(HEADING_FAIL_TORN)
    expect(r.shopkeeperLine).toBe(LINE_FAIL_TORN)
  })
})
