/**
 * 屋台横断の結果解決(STALL_FRAMEWORK §5 / D-010)。three / react / DOM 非依存の純TS(D-003)。
 *
 * 現 reward.ts(金魚専用)を一般化する。tier 境界・見出し・店主セリフ・報酬を
 * **データとして屋台が StallResultRules で供給**し、解決ロジック(resolveStallResult)を共通化する。
 * これにより「score→tier→{見出し/店主セリフ/報酬}」を屋台ごとに再実装せず、文言・報酬・境界は
 * 各屋台 Definition が一元供給する(コードに散らさない = 現 reward.ts の規律を継承)。
 */
import type { StallEndReason, StallResult } from '../stall'

/** 結果の段。GDD §3.2 の3段構成を屋台横断の枠として踏襲(失敗/成功/大成功)。 */
export type ResultTier = 'fail' | 'success' | 'great'

/** 報酬の表示情報(所持品スロット・結果画面で使う純データ)。 */
export interface RewardInfo {
  /** 報酬ID。所持品スロットの表示はこのIDを引いて行う(使用機能は無し)。 */
  readonly id: string
  /** 表示名(短い)。所持品スロットのラベル・結果画面に出す。 */
  readonly name: string
  /** アイコン代わりの絵文字(外部画像アセット禁止のため文字で表す)。 */
  readonly icon: string
}

/** 失敗段の見出し・店主セリフ(終了理由で分岐する1件)。 */
export interface FailText {
  readonly heading: string
  readonly line: string
}

/**
 * 屋台ごとの結果規則(STALL_FRAMEWORK §5.2)。屋台 Definition が供給する。
 * 文言・報酬・境界は GDD が正(コードに散らさない)。
 */
export interface StallResultRules {
  /** score→tier の境界(例 金魚: success>=1, great>=3)。屋台ごとに調整。 */
  readonly thresholds: { readonly success: number; readonly great: number }
  /** 段ごとの見出し(成功/大成功)。fail は reason で分岐するため failByReason で供給。 */
  readonly headings: Readonly<Record<'success' | 'great', string>>
  /** 段ごとの店主セリフ(成功/大成功)。 */
  readonly shopkeeperLines: Readonly<Record<'success' | 'great', string>>
  /** fail段の見出し・セリフを reason(broke/timeout/quit/success)で分岐する。 */
  readonly failByReason: Readonly<Record<StallEndReason, FailText>>
  /** 段→報酬。報酬情報も屋台が供給する。 */
  readonly rewardByTier: Readonly<Record<ResultTier, RewardInfo>>
}

/** 段ごとの確定結果(見出し・店主セリフ・報酬)。現 ResultOutcome の一般化(caught→score)。 */
export interface StallOutcome {
  /** 段(失敗 / 成功 / 大成功)。 */
  readonly tier: ResultTier
  /** スコア(屋台横断の数値。金魚=確保数)。安全に正規化済み。 */
  readonly score: number
  /** 結果画面見出し。 */
  readonly heading: string
  /** 店主のセリフ。 */
  readonly shopkeeperLine: string
  /** 報酬。 */
  readonly reward: RewardInfo
}

/** 話者名(GDD §3.1/§3.2: 「店主」)。 */
export const SHOPKEEPER = '店主'

/** reason が未指定/不正なときの既定(破損)。 */
const DEFAULT_REASON: StallEndReason = 'broke'

/** 渡された値を StallEndReason に正規化する(不正値は破損へ丸める)。 */
function normalizeReason(reason: StallEndReason | undefined): StallEndReason {
  return reason === 'success' ||
    reason === 'timeout' ||
    reason === 'broke' ||
    reason === 'quit'
    ? reason
    : DEFAULT_REASON
}

/** 数値を安全に非負整数へ丸める(負数・非整数・NaN は 0)。 */
function safeScore(score: number): number {
  return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0
}

/**
 * スコアから段を決める(rules.thresholds に従う)。reason には依存しない。
 * 負数や非整数が来ても安全に扱う(0 未満は 0 とみなす)。
 */
export function tierForScore(score: number, rules: StallResultRules): ResultTier {
  const n = safeScore(score)
  if (n >= rules.thresholds.great) return 'great'
  if (n >= rules.thresholds.success) return 'success'
  return 'fail'
}

/**
 * 屋台の最終成果(StallResult)と結果規則(StallResultRules)から、段・見出し・店主セリフ・報酬を
 * 確定する(STALL_FRAMEWORK §5.2)。
 *
 * 段判定(tier)・報酬は score のみで決まる(reason 非依存)。見出し・店主セリフは **失敗段のみ**
 * reason で分岐する(現 reward.ts と同方針)。成功・大成功段は reason 非依存。
 */
export function resolveStallResult(
  result: StallResult,
  rules: StallResultRules,
): StallOutcome {
  const tier = tierForScore(result.score, rules)
  const score = safeScore(result.score)
  const reason = normalizeReason(result.reason)
  const heading =
    tier === 'fail' ? rules.failByReason[reason].heading : rules.headings[tier]
  const shopkeeperLine =
    tier === 'fail' ? rules.failByReason[reason].line : rules.shopkeeperLines[tier]
  return {
    tier,
    score,
    heading,
    shopkeeperLine,
    reward: rules.rewardByTier[tier],
  }
}
