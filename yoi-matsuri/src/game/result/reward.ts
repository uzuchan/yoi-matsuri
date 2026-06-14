/**
 * 金魚すくいの報酬段判定(T-007 / GDD §3.2)。three / react / DOM 非依存の純TS(D-003)。
 *
 * StallFramework 移行(D-010): 本モジュールは **金魚すくいの StallResultRules を供給**し、
 * 解決ロジックは汎用 `resolveStallResult`(stallResult.ts)へ委譲する。公開 API
 * (resolveResult / tierForCaught / REWARDS / 段境界・話者)は移行前と完全に同一のまま保つ
 * (回帰0 = result.test.ts が無改修で緑)。文言・報酬・境界は GAME_DESIGN_DOCUMENT.md §3.2 と
 * INTERACTION_SPEC.md §4 が正で、ここを唯一の出典にする(セリフ・報酬IDのコード分散を防ぐ)。
 *
 * 段判定基準(GDD §3.2「捕獲」の定義 = secured):
 *   - 0 匹      → 'fail'    (失敗)
 *   - 1〜2 匹   → 'success' (成功)
 *   - 3 匹以上  → 'great'   (大成功)
 * 段は reason(torn / timeout / quit)に依らず secured 数のみで決まる(GDD §3.2)。
 */
import {
  resolveStallResult,
  tierForScore,
  SHOPKEEPER as STALL_SHOPKEEPER,
  type RewardInfo,
  type StallResultRules,
} from './stallResult'
import type { StallEndReason } from '../stall'

/** 結果の段。GDD §3.2: 失敗 / 成功 / 大成功。 */
export type ResultTier = 'fail' | 'success' | 'great'

/**
 * 金魚すくいの終了理由(GoldfishSession の finished.reason と同型 / GDD §3.2)。
 *   - 'torn'    : ポイ破損で終了
 *   - 'timeout' : 制限時間切れで終了
 *   - 'quit'    : プレイヤーが途中退出(Esc)で終了
 * 見出し・店主セリフは失敗段(secured 0匹)のみ reason で分岐する(GDD §3.2 v1.2)。
 */
export type ResultReason = 'torn' | 'timeout' | 'quit'

/** 報酬ID(GDD §3.2)。所持品スロットの表示はこのIDを引いて行う(使用機能は無し)。 */
export type RewardId = 'reward:candy' | 'reward:bag-small' | 'reward:bag-deluxe'

/**
 * 報酬の表示情報(所持品スロット・結果画面で使う純データ)。
 * StallFramework 移行(D-010): 屋台横断の RewardInfo(stallResult.ts。id: string)を正とし、
 * 金魚はその一部(id は RewardId のいずれか)として扱う(型は同一なので所持品・結果表示は不変)。
 */
export type { RewardInfo }

/** 段ごとの確定結果(見出し・店主セリフ・報酬)。 */
export interface ResultOutcome {
  /** 段(失敗 / 成功 / 大成功)。 */
  readonly tier: ResultTier
  /** 確保数(secured = finished.caught)をそのまま保持する。 */
  readonly caught: number
  /** 結果画面見出し(INTERACTION_SPEC §4)。 */
  readonly heading: string
  /** 店主のセリフ(GDD §3.2)。 */
  readonly shopkeeperLine: string
  /** 報酬(GDD §3.2)。 */
  readonly reward: RewardInfo
}

/** 話者名(GDD §3.1/§3.2: 「店主」)。 */
export const SHOPKEEPER = STALL_SHOPKEEPER

/** 段の境界(GDD §3.2)。1 匹以上で成功、3 匹以上で大成功。 */
export const SUCCESS_THRESHOLD = 1
export const GREAT_THRESHOLD = 3

/** 報酬の表示情報テーブル(GDD §3.2)。 */
export const REWARDS: Readonly<Record<RewardId, RewardInfo>> = {
  'reward:candy': { id: 'reward:candy', name: 'ラムネ風アメ', icon: '🍬' },
  'reward:bag-small': { id: 'reward:bag-small', name: '金魚袋', icon: '🐟' },
  'reward:bag-deluxe': { id: 'reward:bag-deluxe', name: '大きな金魚袋+出目金', icon: '🎏' },
}

/**
 * 結果画面見出し(成功・大成功 / INTERACTION_SPEC §4)。reason 非依存。
 * 失敗段(0匹)は破れた/破れていないで文言が変わるため failByReason で分岐する。
 */
const HEADINGS: Readonly<Record<'success' | 'great', string>> = {
  success: '金魚をすくった!',
  great: '大漁!名人級!',
}

/** 店主のセリフ(成功・大成功 / GDD §3.2)。reason 非依存。 */
const SHOPKEEPER_LINES: Readonly<Record<'success' | 'great', string>> = {
  success: 'おっ、やるねえ!ほら、大事にしてやんなよ。',
  great: 'うおっ、名人かい!?こりゃあ参った、特別だ!',
}

// --- 失敗段(0匹)の見出し・店主セリフ(終了理由で分岐 / GDD §3.2 v1.2)---
// torn(破損): 「ポイが破れてしまった…」
// timeout/quit: 「すくえなかった…」(破れていないのに「破れた」と出る齟齬を解消)
const FAIL_TORN: { heading: string; line: string } = {
  heading: 'ポイが破れてしまった…',
  line: 'ありゃー、破れちまったか。まあ祭りの夜は長いんだ、また挑戦しな!',
}
const FAIL_NOSCOOP: { heading: string; line: string } = {
  heading: 'すくえなかった…',
  line: 'おっと時間だ。今日はご縁がなかったか。…また挑戦しな!',
}

/** 段ごとの報酬ID(GDD §3.2)。 */
const TIER_REWARD: Readonly<Record<ResultTier, RewardId>> = {
  fail: 'reward:candy',
  success: 'reward:bag-small',
  great: 'reward:bag-deluxe',
}

/**
 * 金魚すくいの StallResultRules(StallFramework §5.2)。
 * 現 reward.ts の値(境界・文言・報酬)をそのまま StallResultRules へ転記したもの。
 * 金魚 Definition(scenes/stall/definitions/goldfish.ts)はこれを供給して結果を解決する。
 * StallEndReason('broke' は torn の一般化)へ写像する: torn→broke / timeout→timeout / quit→quit。
 * success(成功で終了)は失敗段に来ないため、表示上は破損文言にフォールバックさせておく。
 */
export const GOLDFISH_RESULT_RULES: StallResultRules = {
  thresholds: { success: SUCCESS_THRESHOLD, great: GREAT_THRESHOLD },
  headings: HEADINGS,
  shopkeeperLines: SHOPKEEPER_LINES,
  failByReason: {
    broke: FAIL_TORN,
    timeout: FAIL_NOSCOOP,
    quit: FAIL_NOSCOOP,
    success: FAIL_NOSCOOP,
  },
  rewardByTier: {
    fail: REWARDS[TIER_REWARD.fail],
    success: REWARDS[TIER_REWARD.success],
    great: REWARDS[TIER_REWARD.great],
  },
}

/**
 * 確保数(secured)から段を決める(GDD §3.2)。reason には依存しない。
 * 負数や非整数が来ても安全に扱う(0 未満は 0 とみなす)。
 */
export function tierForCaught(caught: number): ResultTier {
  return tierForScore(caught, GOLDFISH_RESULT_RULES)
}

/** 金魚の終了理由(ResultReason)を屋台横断の StallEndReason へ写像する(torn→broke)。 */
function toStallReason(reason: ResultReason | undefined): StallEndReason {
  if (reason === 'timeout') return 'timeout'
  if (reason === 'quit') return 'quit'
  // 'torn'・未指定・不正値はすべて破損(broke)扱い(後方互換: 旧 resolveResult(caught) を破損扱い)。
  return 'broke'
}

/**
 * 確保数(secured = finished.caught)と終了理由(reason)から結果(段・見出し・店主セリフ・報酬)を
 * 確定する。結果画面(ResultScene / ui/Result)はこの戻り値を表示・所持品反映に使う。
 *
 * 実体は汎用 `resolveStallResult` へ委譲する(回帰0 = 出力は移行前と完全同一)。
 * 段判定(tier)・報酬は secured 数のみで決まる(reason 非依存 / GDD §3.2)。
 * 見出し・店主セリフは **失敗段(0匹)のみ** reason で分岐する(GDD §3.2 v1.2)。
 */
export function resolveResult(caught: number, reason?: ResultReason): ResultOutcome {
  const stallReason = toStallReason(reason)
  const outcome = resolveStallResult({ score: caught, reason: stallReason }, GOLDFISH_RESULT_RULES)
  return {
    tier: outcome.tier,
    caught: outcome.score,
    heading: outcome.heading,
    shopkeeperLine: outcome.shopkeeperLine,
    reward: outcome.reward,
  }
}
