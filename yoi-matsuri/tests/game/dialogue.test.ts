import { describe, expect, it } from 'vitest'
import {
  GoldfishStallDialogue,
  GOLDFISH_STALL_SCRIPT,
  CHOICE_PLAY,
  CHOICE_LATER,
  TYPING_CHARS_PER_SEC,
  createGoldfishStallDialogue,
} from '../../src/game/dialogue'

/**
 * 店主会話の状態機械(T-004 段B / GDD §3.1)の unit test。
 * three/react/DOM 非依存の純TS。開始 → セリフ送り → 選択肢 → 各分岐、Esc 打ち切りを網羅する。
 */

const DT = 1 / 60
const INTRO_0 = GOLDFISH_STALL_SCRIPT.introLines[0].text
const INTRO_1 = GOLDFISH_STALL_SCRIPT.introLines[1].text
const CLOSING_LATER = GOLDFISH_STALL_SCRIPT.choices.find((c) => c.id === CHOICE_LATER)!
  .closingLines![0].text

/** セリフを最後まで送り切るのに十分な時間を tick する。 */
function tickUntilTyped(d: GoldfishStallDialogue): void {
  // どのセリフも数十文字。1 秒分(30字)を複数回回せば確実に全表示になる。
  for (let i = 0; i < 240; i++) d.tick(DT)
}

describe('GoldfishStallDialogue(店主会話の状態機械)', () => {
  it('start で 1 つ目のセリフ(店主)を表示開始する。文言は GDD §3.1 のとおり', () => {
    const d = new GoldfishStallDialogue()
    d.start()
    const v = d.view()
    expect(v.active).toBe(true)
    expect(v.speaker).toBe('店主')
    expect(v.text).toBe(INTRO_0)
    expect(INTRO_0).toBe(
      'おう、いらっしゃい!兄ちゃん(姉ちゃん)、金魚すくいやってかない?',
    )
    expect(v.choices).toHaveLength(0)
    expect(v.focusedChoiceIndex).toBe(-1)
  })

  it('tick で 1 文字ずつ送り(約30字/s)、typing が進む', () => {
    const d = new GoldfishStallDialogue()
    d.start()
    expect(d.view().visibleText).toBe('')
    expect(d.view().typing).toBe(true)

    // 0.5 秒分 tick すると約 15 文字表示される(30字/s)。
    for (let i = 0; i < 30; i++) d.tick(DT)
    const v = d.view()
    expect(v.visibleText.length).toBeGreaterThanOrEqual(14)
    expect(v.visibleText.length).toBeLessThanOrEqual(16)
    expect(v.visibleText).toBe(INTRO_0.slice(0, v.visibleText.length))
    expect(TYPING_CHARS_PER_SEC).toBe(30)
  })

  it('送り中の advance で全文即時表示(typing が終わる)', () => {
    const d = new GoldfishStallDialogue()
    d.start()
    d.tick(DT) // 数文字だけ表示
    expect(d.view().typing).toBe(true)

    const outcome = d.advance()
    expect(outcome).toEqual({ kind: 'continue' })
    const v = d.view()
    expect(v.visibleText).toBe(INTRO_0)
    expect(v.typing).toBe(false)
  })

  it('全文表示後の advance で次のセリフへ進む(2 つ目=ポイの説明)', () => {
    const d = new GoldfishStallDialogue()
    d.start()
    tickUntilTyped(d)
    expect(d.view().typing).toBe(false)

    d.advance() // 次のセリフへ
    const v = d.view()
    expect(v.text).toBe(INTRO_1)
    expect(INTRO_1).toBe('ポイは一枚。破れたらおしまいだ。そーっとな、そーっと。')
    expect(v.visibleText).toBe('') // 新セリフは最初から送り直し
    expect(v.typing).toBe(true)
    expect(v.choices).toHaveLength(0)
  })

  it('最後のセリフを送り切ると選択肢を表示する(遊んでいく / またあとで)', () => {
    const d = new GoldfishStallDialogue()
    d.start()
    // 1 つ目を送り切って次へ
    tickUntilTyped(d)
    d.advance()
    // 2 つ目を送り切って選択肢へ
    tickUntilTyped(d)
    d.advance()

    const v = d.view()
    expect(v.choices.map((c) => c.id)).toEqual([CHOICE_PLAY, CHOICE_LATER])
    expect(v.choices.map((c) => c.label)).toEqual(['遊んでいく', 'またあとで'])
    expect(v.focusedChoiceIndex).toBe(0) // 既定は先頭にフォーカス
    expect(v.typing).toBe(false)
    expect(v.text).toBe('') // 選択肢表示中はセリフ非表示
    expect(v.visibleText).toBe('')
    expect(v.active).toBe(true)
  })

  it('選択肢表示中の advance は無効(確定は confirm のみ)', () => {
    const d = startAtChoices()
    const before = d.view()
    const outcome = d.advance()
    expect(outcome).toEqual({ kind: 'continue' })
    expect(d.view()).toEqual(before) // 状態不変
  })

  it('moveFocus でフォーカスが循環移動する(↑↓)', () => {
    const d = startAtChoices()
    expect(d.view().focusedChoiceIndex).toBe(0)
    d.moveFocus(1)
    expect(d.view().focusedChoiceIndex).toBe(1)
    d.moveFocus(1) // 末尾から先頭へラップ
    expect(d.view().focusedChoiceIndex).toBe(0)
    d.moveFocus(-1) // 先頭から末尾へラップ
    expect(d.view().focusedChoiceIndex).toBe(1)
  })

  it('focus(index) で指定フォーカス、範囲外は無視(ホバー)', () => {
    const d = startAtChoices()
    d.focus(1)
    expect(d.view().focusedChoiceIndex).toBe(1)
    d.focus(99) // 範囲外
    expect(d.view().focusedChoiceIndex).toBe(1) // 据え置き
    d.focus(-1) // 範囲外
    expect(d.view().focusedChoiceIndex).toBe(1)
  })

  it('「遊んでいく」確定 → 即座に choice(play) を返し会話終了', () => {
    const d = startAtChoices()
    d.focus(0) // 遊んでいく
    const outcome = d.confirm()
    expect(outcome).toEqual({ kind: 'choice', choiceId: CHOICE_PLAY })
    expect(d.view().active).toBe(false)
  })

  it('「またあとで」確定 → 締めセリフ「おう、また来な!」を表示し、送り切って choice(later)', () => {
    const d = startAtChoices()
    d.focus(1) // またあとで
    const outcome = d.confirm()
    // 締めセリフ表示フェーズへ。まだ会話継続。
    expect(outcome).toEqual({ kind: 'continue' })
    let v = d.view()
    expect(v.active).toBe(true)
    expect(v.choices).toHaveLength(0) // 選択肢は消える
    expect(v.text).toBe(CLOSING_LATER)
    expect(CLOSING_LATER).toBe('おう、また来な!')

    // 締めセリフを送り切る。
    tickUntilTyped(d)
    v = d.view()
    expect(v.visibleText).toBe(CLOSING_LATER)
    expect(v.typing).toBe(false)

    // 送り切った後の advance で分岐確定。
    const final = d.advance()
    expect(final).toEqual({ kind: 'choice', choiceId: CHOICE_LATER })
    expect(d.view().active).toBe(false)
  })

  it('締めセリフ送り中の advance は全文即時表示し、もう一度の advance で確定する', () => {
    const d = startAtChoices()
    d.focus(1)
    d.confirm() // closing へ
    d.tick(DT) // 数文字だけ
    expect(d.view().typing).toBe(true)

    const skip = d.advance() // 全文即時
    expect(skip).toEqual({ kind: 'continue' })
    expect(d.view().visibleText).toBe(CLOSING_LATER)
    expect(d.view().typing).toBe(false)

    const final = d.advance() // 確定
    expect(final).toEqual({ kind: 'choice', choiceId: CHOICE_LATER })
  })

  it('confirm は選択肢表示中以外では continue を返す(セリフ送り中・終了後)', () => {
    const d = new GoldfishStallDialogue()
    d.start()
    expect(d.confirm()).toEqual({ kind: 'continue' }) // intro 中
    d.abort()
    expect(d.confirm()).toEqual({ kind: 'continue' }) // 終了後
  })

  it('Esc 打ち切り: abort はどの状態でも aborted を返し active を false にする', () => {
    // セリフ送り中
    const d1 = new GoldfishStallDialogue()
    d1.start()
    expect(d1.abort()).toEqual({ kind: 'aborted' })
    expect(d1.view().active).toBe(false)

    // 選択肢表示中
    const d2 = startAtChoices()
    expect(d2.abort()).toEqual({ kind: 'aborted' })
    expect(d2.view().active).toBe(false)

    // 締めセリフ中
    const d3 = startAtChoices()
    d3.focus(1)
    d3.confirm()
    expect(d3.abort()).toEqual({ kind: 'aborted' })
    expect(d3.view().active).toBe(false)
  })

  it('moveFocus / focus は選択肢非表示時には無効', () => {
    const d = new GoldfishStallDialogue()
    d.start() // intro 中(選択肢なし)
    d.moveFocus(1)
    d.focus(0)
    expect(d.view().focusedChoiceIndex).toBe(-1)
  })

  it('start を再度呼ぶと最初からやり直せる(再開可能)', () => {
    const d = startAtChoices()
    d.start()
    const v = d.view()
    expect(v.text).toBe(INTRO_0)
    expect(v.visibleText).toBe('')
    expect(v.choices).toHaveLength(0)
    expect(v.active).toBe(true)
  })

  it('createGoldfishStallDialogue は GoldfishStallDialogue を生成する', () => {
    const d = createGoldfishStallDialogue()
    d.start()
    expect(d.view().text).toBe(INTRO_0)
  })
})

/** intro を送り切って選択肢表示状態にした controller を返すヘルパ。 */
function startAtChoices(): GoldfishStallDialogue {
  const d = new GoldfishStallDialogue()
  d.start()
  tickUntilTyped(d)
  d.advance()
  tickUntilTyped(d)
  d.advance()
  return d
}
