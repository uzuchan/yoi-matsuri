/**
 * 汎用屋台会話のフォールバック(STALL_FRAMEWORK §2.5)。three / react / DOM 非依存の純TS。
 *
 * 全屋台に固有会話を一気に書くのは非現実的なため、StallDefinition.createDialogue 省略時は
 * displayName を流し込む汎用 DialogueController を自動生成する。これで「定義を登録した瞬間に
 * 会話付きで遊べる」最小成立を保証する(固有会話は後から createDialogue を足すだけで差し替わる)。
 *
 *   店主「いらっしゃい!{displayName}、やってかないかい?」
 *     選択: [遊んでいく(play) / またあとで(later)]
 *     later → 「おう、また来な!」→ approach(closingLines)
 */
import type { DialogueController } from '../../core'
import { GoldfishStallDialogue } from './GoldfishStallDialogue'
import { SHOPKEEPER, CHOICE_PLAY, CHOICE_LATER, type DialogueScript } from './script'

/** displayName を流し込んだ汎用会話スクリプトを作る。 */
export function createGenericStallScript(displayName: string): DialogueScript {
  return {
    introLines: [
      { speaker: SHOPKEEPER, text: `いらっしゃい!${displayName}、やってかないかい?` },
    ],
    choices: [
      { id: CHOICE_PLAY, label: '遊んでいく' },
      {
        id: CHOICE_LATER,
        label: 'またあとで',
        closingLines: [{ speaker: SHOPKEEPER, text: 'おう、また来な!' }],
      },
    ],
  }
}

/**
 * 汎用屋台会話の DialogueController を生成する(店主会話の状態機械は GoldfishStallDialogue を再利用。
 * スクリプトだけ displayName で差し替える)。
 */
export function createGenericStallDialogue(displayName: string): DialogueController {
  return new GoldfishStallDialogue(createGenericStallScript(displayName))
}
