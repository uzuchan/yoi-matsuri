/**
 * 屋台横断の遊び契約(STALL_FRAMEWORK §1 / D-010)。three / react / DOM 非依存の純TS(D-003)。
 *
 * 公開する契約:
 *  - StallSession: update(dt,input)→Event[] / snapshot()→State / status / result() の契約
 *  - StallStatus / StallEndReason / StallResult: 屋台横断のステータス・終了理由・成果
 *  - StallSnapshot: 汎用 HUD(残時間 + 0..1 危険度 + スコア)が読む最小スナップショット契約
 *  - StallCommonEvent: 全屋台共通の 'stall-finished' 記述子(finished 単発発火を基盤に集約)
 */
export type {
  StallSession,
  StallStatus,
  StallEndReason,
  StallResult,
  StallSnapshot,
  StallCommonEvent,
} from './session'
