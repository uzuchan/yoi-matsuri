/**
 * P2 量産屋台の店主会話(スーパーボールすくい / お面屋)。
 * three / react / DOM 非依存の純データ。会話状態機械は GoldfishStallDialogue を再利用し、
 * スクリプト(セリフ・選択肢)だけ屋台ごとに差し替える(StallFramework §2.5 と同パターン)。
 *
 * 店主トーン(MINIGAME_ARCHETYPES §2): スーパーボール=子ども相手の柔らかさ / お面=物静か・含蓄。
 * 初回会話のセリフは「操作ヒントを兼ねる」(VISION 成功定義 / 金魚すくい §3.1「そーっとな」に倣う)。
 */
import type { DialogueController } from '../../core'
import { GoldfishStallDialogue } from './GoldfishStallDialogue'
import { SHOPKEEPER, CHOICE_PLAY, CHOICE_LATER, type DialogueScript } from './script'

/** スーパーボールすくい屋台・初回会話(店主トーン: 子ども相手の柔らかさ)。 */
export const SUPERBALL_STALL_SCRIPT: DialogueScript = {
  introLines: [
    { speaker: SHOPKEEPER, text: 'いらっしゃい!スーパーボールすくい、やってみるかい?' },
    { speaker: SHOPKEEPER, text: 'ボールはよく浮くからね、そーっとすくうとたくさん取れるよ。' },
  ],
  choices: [
    { id: CHOICE_PLAY, label: '遊んでいく' },
    {
      id: CHOICE_LATER,
      label: 'またあとで',
      closingLines: [{ speaker: SHOPKEEPER, text: 'うん、また来てね!' }],
    },
  ],
}

/** お面屋・初回会話(店主トーン: 物静か・含蓄)。選択式=コレクション(§2 #19)。 */
export const MASK_STALL_SCRIPT: DialogueScript = {
  introLines: [
    { speaker: SHOPKEEPER, text: 'おや、お面をお探しかい。…どれも、いい顔をしているよ。' },
    { speaker: SHOPKEEPER, text: '気に入ったのを、ひとつ選んでいきなさい。縁があるものさ。' },
  ],
  choices: [
    { id: CHOICE_PLAY, label: 'お面を選ぶ' },
    {
      id: CHOICE_LATER,
      label: 'またあとで',
      closingLines: [{ speaker: SHOPKEEPER, text: '…ああ。いつでも、おいで。' }],
    },
  ],
}

/** スーパーボールすくいの DialogueController を生成する(状態機械は金魚と共通)。 */
export function createSuperballStallDialogue(): DialogueController {
  return new GoldfishStallDialogue(SUPERBALL_STALL_SCRIPT)
}

/** お面屋の DialogueController を生成する(状態機械は金魚と共通)。 */
export function createMaskStallDialogue(): DialogueController {
  return new GoldfishStallDialogue(MASK_STALL_SCRIPT)
}
