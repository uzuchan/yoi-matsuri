import { describe, expect, it } from 'vitest'
import {
  createGenericStallDialogue,
  createGenericStallScript,
  CHOICE_PLAY,
  CHOICE_LATER,
} from '../../src/game/dialogue'

/**
 * 汎用屋台会話フォールバックのテスト(StallFramework §2.5)。
 * displayName を流し込み、「遊んでいく/またあとで」の2択で成立することを固定する。
 * 固有会話を持たない屋台が「登録した瞬間に会話付きで遊べる」最小成立の担保。
 */

describe('createGenericStallScript(displayName 差し込み / §2.5)', () => {
  it('intro に displayName を含み、選択肢は play / later の2択', () => {
    const script = createGenericStallScript('射的')
    expect(script.introLines[0].text).toContain('射的')
    expect(script.choices.map((c) => c.id)).toEqual([CHOICE_PLAY, CHOICE_LATER])
    // 「またあとで」は締めセリフを持つ(GoldfishStallDialogue 同様)。
    const later = script.choices.find((c) => c.id === CHOICE_LATER)
    expect(later?.closingLines?.length).toBeGreaterThan(0)
  })
})

describe('createGenericStallDialogue(controller として駆動できる)', () => {
  it('start→送り切り→「遊んでいく」確定で choice(play) を返す', () => {
    const ctrl = createGenericStallDialogue('わたがし')
    ctrl.start()
    // intro を送り切る(全文表示→次)。
    for (let i = 0; i < 8 && ctrl.view().choices.length === 0; i++) ctrl.advance()
    expect(ctrl.view().choices.length).toBe(2)
    // 先頭(遊んでいく)を確定。
    ctrl.focus(0)
    const outcome = ctrl.confirm()
    expect(outcome).toEqual({ kind: 'choice', choiceId: CHOICE_PLAY })
  })
})
