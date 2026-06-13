/**
 * 結果ドメイン(T-007 / GDD §3.2)。three / react / DOM 非依存の純TS(D-003)。
 *
 * 金魚すくい終了時の確保数(secured = finished.caught)から、店主の反応の段・見出し・
 * 店主セリフ・報酬を確定する。合成点(App.tsx)・ResultScene・ui/Result がこのデータを表示する。
 */
export {
  resolveResult,
  tierForCaught,
  REWARDS,
  SHOPKEEPER,
  SUCCESS_THRESHOLD,
  GREAT_THRESHOLD,
} from './reward'
export type { ResultTier, ResultReason, RewardId, RewardInfo, ResultOutcome } from './reward'
