/**
 * 店主会話のデータ(GDD §3.1 初回会話)。three / react / DOM 非依存の純データ。
 *
 * 文言は GAME_DESIGN_DOCUMENT.md §3.1 が正。ここを唯一の出典とし、UI/シーンは
 * このデータを表示・駆動するだけにする(セリフのコード分散を防ぐ)。
 */

/** 1 つの選択肢の定義(分岐識別子・表示文言)。 */
export interface DialogueChoiceDef {
  /** 分岐識別子。'dialogue:choice' の choiceId・遷移分岐の判定に使う。 */
  readonly id: string
  /** 画面に表示する文言(GDD §3.1)。 */
  readonly label: string
  /**
   * 確定時に、選択を確定する前に表示する締めセリフ(任意)。
   * 「またあとで」は店主「おう、また来な!」を表示してから approach へ戻る(GDD §3.1)。
   * 未指定の選択肢(「遊んでいく」)は締めセリフなしで即座に分岐を確定する。
   */
  readonly closingLines?: readonly DialogueLine[]
}

/** 1 行のセリフ(話者・本文)。 */
export interface DialogueLine {
  readonly speaker: string
  readonly text: string
}

/**
 * 会話スクリプト: 前置きのセリフ列 → 選択肢、という構造。
 * 「またあとで」は closingLines を持ち、確定前に締めセリフを表示する。
 */
export interface DialogueScript {
  /** 選択肢が出る前に順に送るセリフ列。 */
  readonly introLines: readonly DialogueLine[]
  /** introLines を送り切った後に表示する選択肢。 */
  readonly choices: readonly DialogueChoiceDef[]
}

/** 話者名(GDD §3.1: 「店主」)。 */
export const SHOPKEEPER = '店主'

/** 「遊んでいく」分岐の識別子(goldfish へ)。 */
export const CHOICE_PLAY = 'play'
/** 「またあとで」分岐の識別子(approach へ戻る)。 */
export const CHOICE_LATER = 'later'

/**
 * 金魚すくい屋台・初回会話(GDD §3.1)。文言はドキュメントのとおり。
 */
export const GOLDFISH_STALL_SCRIPT: DialogueScript = {
  introLines: [
    {
      speaker: SHOPKEEPER,
      text: 'おう、いらっしゃい!兄ちゃん(姉ちゃん)、金魚すくいやってかない?',
    },
    {
      speaker: SHOPKEEPER,
      text: 'ポイは一枚。破れたらおしまいだ。そーっとな、そーっと。',
    },
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
