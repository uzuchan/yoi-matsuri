/**
 * 結果ドメイン(T-007 / GDD §3.2 / StallFramework §5・D-010)。
 * three / react / DOM 非依存の純TS(D-003)。
 *
 * - 汎用(屋台横断): resolveStallResult / tierForScore / StallResultRules / StallOutcome / RewardInfo
 *   = 屋台が供給する score→tier→{見出し/店主セリフ/報酬} 規則と共通解決ロジック。
 * - 金魚固有(後方互換): resolveResult / tierForCaught / REWARDS / GOLDFISH_RESULT_RULES …
 *   = 現行 API を維持(回帰0)。実体は汎用へ委譲する。
 */
export {
  resolveResult,
  tierForCaught,
  REWARDS,
  GOLDFISH_RESULT_RULES,
  SHOPKEEPER,
  SUCCESS_THRESHOLD,
  GREAT_THRESHOLD,
} from './reward'
export type { ResultTier, ResultReason, RewardId, ResultOutcome } from './reward'

export {
  resolveStallResult,
  tierForScore,
} from './stallResult'
export type {
  StallResultRules,
  StallOutcome,
  RewardInfo,
  FailText,
} from './stallResult'

// P2 量産屋台の結果規則(屋台が供給するデータ)。
export { SUPERBALL_RESULT_RULES } from './superballResult'
export { MASK_RESULT_RULES } from './maskResult'
