/**
 * スーパーボールすくいの結果規則(MINIGAME_ARCHETYPES 原型A #1 / §4 報酬方針)。
 * three / react / DOM 非依存の純TS(D-003)。汎用 resolveStallResult(stallResult.ts)へ供給する
 * StallResultRules をデータとして定義する(文言・報酬・境界はここを唯一の出典にする)。
 *
 * 段判定(§2 #1: 報酬「ボール1個 / 数個 / 大量+レアボール」/ §1 SCOOP の3段)。
 *   スーパーボールは「確保が軽い代わり数を要求」する差別化(§2 #1)のため、金魚(1/3)より境界を上げる:
 *     - 0 個      → 失敗(残念賞)
 *     - 2〜4 個   → 成功(数個すくえた)
 *     - 5 個以上  → 大成功(大量+レアボール)
 * 店主トーン: 子ども相手の柔らかさ(§2 #1)。失敗段は reason(破損/時間切れ/退出)で見出し・セリフを分岐する。
 */
import type { StallResultRules } from './stallResult'

/** スーパーボール報酬の表示情報(所持品スロット・結果画面)。ID は屋台プレフィックス付き(§5.2)。 */
const SUPERBALL_REWARDS = {
  consolation: { id: 'reward:superball:consolation', name: 'ラムネ風アメ', icon: '🍬' },
  few: { id: 'reward:superball:few', name: 'スーパーボール', icon: '🔴' },
  many: { id: 'reward:superball:many', name: 'スーパーボール大袋+レア', icon: '✨' },
} as const

/** スーパーボールすくいの結果規則。 */
export const SUPERBALL_RESULT_RULES: StallResultRules = {
  // 「数を要求」する差別化: 成功 2 個以上 / 大成功 5 個以上。
  thresholds: { success: 2, great: 5 },
  headings: {
    success: 'すくえたね!',
    great: '大量すくい!すごい!',
  },
  shopkeeperLines: {
    success: 'お、上手だねえ。好きなの選んで持っていきな。',
    great: 'わあ、こんなに!よく取れたね、ほら、特別なのもおまけだ。',
  },
  failByReason: {
    // 成功で失敗段に来ることはないが、型の網羅のため穏当な文言を置く。
    success: {
      heading: 'すくえなかった…',
      line: 'おしかったね。また今度すくいにおいで。',
    },
    timeout: {
      heading: 'すくえなかった…',
      line: 'おっと時間だ。ボールはすばしっこいからね、また挑戦しな。',
    },
    broke: {
      heading: 'ポイが破れちゃった…',
      line: 'あらら、破れちゃったか。そーっとすくうのがコツだよ。また来てね。',
    },
    quit: {
      heading: 'またね',
      line: 'うん、また気が向いたらおいで。',
    },
  },
  rewardByTier: {
    fail: SUPERBALL_REWARDS.consolation,
    success: SUPERBALL_REWARDS.few,
    great: SUPERBALL_REWARDS.many,
  },
}
