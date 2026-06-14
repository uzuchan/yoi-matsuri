/**
 * お面屋の結果規則(CHOICE 原型 / 屋台#19 / §4 報酬方針)。
 * three / react / DOM 非依存の純TS(D-003)。汎用 resolveStallResult(stallResult.ts)へ供給する。
 *
 * 段判定(§2 #19: 失敗概念なし / 選んだ面 / 未所持の新しい面=大成功 / §1 CHOICE)。
 *   - 0  → fail   (選ばずに退出した時のみ。reason=quit で穏当に送り出す = 「失敗」感を出さない)
 *   - 1  → success(お面を選べた)
 *   - 2  → great  (希少なお面=般若 を選んだ)
 *
 * 店主トーン: 物静か・含蓄(§2 #19)。報酬はその屋台の "現物"(お面)。tier ベースの汎用報酬として
 * 「えらんだお面」(成功)/「般若のお面」(大成功=希少枠)を渡す(現フレームワークの reward は tier 解決)。
 */
import type { StallResultRules } from './stallResult'

/** お面の報酬表示情報(所持品スロット・結果画面)。ID は屋台プレフィックス付き(§5.2)。 */
const MASK_REWARDS = {
  // 退出(選ばなかった)時の手ぶら防止の残念賞。お面屋では「また来な」の小物。
  none: { id: 'reward:mask:none', name: '縁日のしおり', icon: '📜' },
  chosen: { id: 'reward:mask:chosen', name: 'えらんだお面', icon: '🎭' },
  rare: { id: 'reward:mask:hannya', name: '般若のお面', icon: '👹' },
} as const

/** お面屋の結果規則。 */
export const MASK_RESULT_RULES: StallResultRules = {
  thresholds: { success: 1, great: 2 },
  headings: {
    success: 'お面をえらんだ',
    great: '見事な般若のお面!',
  },
  shopkeeperLines: {
    success: '…いい選びだ。その面、きっと似合うよ。大事にしな。',
    great: 'ほう、般若をかい。…肝の据わった選びだ。持っていきな。',
  },
  failByReason: {
    // 物理がないので broke/timeout は起きないが、型網羅のため穏当な文言を置く。
    success: { heading: 'またね', line: '…ああ、また縁があったら。' },
    timeout: { heading: 'またね', line: '…ああ、また縁があったら。' },
    broke: { heading: 'またね', line: '…ああ、また縁があったら。' },
    quit: {
      heading: 'またね',
      line: '…ゆっくり選ぶといい。お面は逃げやしないよ。',
    },
  },
  rewardByTier: {
    fail: MASK_REWARDS.none,
    success: MASK_REWARDS.chosen,
    great: MASK_REWARDS.rare,
  },
}
