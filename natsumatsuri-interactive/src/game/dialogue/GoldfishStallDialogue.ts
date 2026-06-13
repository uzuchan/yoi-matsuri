import type {
  DialogueChoice,
  DialogueController,
  DialogueOutcome,
  DialogueView,
} from '../../core'
import {
  GOLDFISH_STALL_SCRIPT,
  type DialogueChoiceDef,
  type DialogueLine,
  type DialogueScript,
} from './script'

/**
 * 1 文字送りの速度(INTERACTION_SPEC §3.2: 約30字/s)。tick(dt) で進める。
 */
export const TYPING_CHARS_PER_SEC = 30

/**
 * 会話の内部フェーズ。
 * - 'intro':   前置きのセリフ列を順に送っている
 * - 'choices': 選択肢を表示している(フォーカス移動・確定を受ける)
 * - 'closing': 選択確定後の締めセリフを送っている(「またあとで」→「おう、また来な!」)
 * - 'done':    会話終了(打ち切り or 分岐確定済み)。view().active=false
 */
type Phase = 'intro' | 'choices' | 'closing' | 'done'

/**
 * 店主との初回会話(GDD §3.1)を実装する DialogueController(D-008 / T-004 段B)。
 *
 * three / react / DOM 非依存の純TS。入力2経路(キーボード=DialogueScene / クリック=ui/Dialogue)は
 * 同一の controller メソッドへ集約される(D-008)。表示状態は view() でスナップショットを返し、
 * その変化は DialogueScene が 'dialogue:view-changed' で HUD へ橋渡しする。
 *
 * 状態遷移(GDD §3.1):
 *   intro(2セリフ)→ choices[遊んでいく / またあとで]
 *     ・「遊んでいく」確定 → outcome { kind:'choice', choiceId:'play' }(DialogueScene が goldfish へ)
 *     ・「またあとで」確定 → closing「おう、また来な!」を送り、送り切ったら
 *                            outcome { kind:'choice', choiceId:'later' }(DialogueScene が approach へ)
 *   Esc(abort)はどの状態からでも { kind:'aborted' }(DialogueScene が approach へ)
 */
export class GoldfishStallDialogue implements DialogueController {
  private readonly script: DialogueScript

  private phase: Phase = 'intro'
  /** 現在送っているセリフ列(intro なら introLines、closing なら選択の closingLines)。 */
  private currentLines: readonly DialogueLine[] = []
  /** currentLines 内のインデックス。 */
  private lineIndex = 0
  /** 現在の可視文字数(1文字送り)。小数で保持し floor して表示する。 */
  private visibleChars = 0
  /** 選択肢のフォーカス位置('choices' フェーズのみ有効。それ以外は -1)。 */
  private focusedChoiceIndex = 0
  /**
   * closing フェーズを抜けたときに確定する選択肢(「またあとで」)。
   * closing 表示中に保持し、送り切った advance で outcome として返す。
   */
  private pendingChoiceId: string | null = null

  constructor(script: DialogueScript = GOLDFISH_STALL_SCRIPT) {
    this.script = script
  }

  start(): void {
    this.phase = 'intro'
    this.currentLines = this.script.introLines
    this.lineIndex = 0
    this.visibleChars = 0
    this.focusedChoiceIndex = 0
    this.pendingChoiceId = null
  }

  tick(dt: number): void {
    if (this.phase !== 'intro' && this.phase !== 'closing') return
    const full = this.currentLineText().length
    if (this.visibleChars >= full) return
    this.visibleChars = Math.min(full, this.visibleChars + dt * TYPING_CHARS_PER_SEC)
  }

  advance(): DialogueOutcome {
    if (this.phase === 'done' || this.phase === 'choices') {
      // 選択肢表示中の advance は無効(確定は confirm 経由)。終了後も無視。
      return { kind: 'continue' }
    }

    const full = this.currentLineText().length
    if (this.visibleChars < full) {
      // 送り中: 全文を即時表示する(INTERACTION_SPEC §3.2)。
      this.visibleChars = full
      return { kind: 'continue' }
    }

    // 現在行は表示済み。次の行へ、または次フェーズへ進む。
    if (this.lineIndex < this.currentLines.length - 1) {
      this.lineIndex += 1
      this.visibleChars = 0
      return { kind: 'continue' }
    }

    // セリフ列の最後を送り切った。
    if (this.phase === 'intro') {
      // 前置き完了 → 選択肢表示へ。
      this.phase = 'choices'
      this.focusedChoiceIndex = 0
      return { kind: 'continue' }
    }

    // phase === 'closing': 締めセリフを送り切った → 保留していた分岐を確定する。
    const choiceId = this.pendingChoiceId
    this.phase = 'done'
    this.pendingChoiceId = null
    return choiceId !== null ? { kind: 'choice', choiceId } : { kind: 'continue' }
  }

  moveFocus(delta: number): void {
    if (this.phase !== 'choices') return
    const count = this.script.choices.length
    if (count === 0) return
    // 循環フォーカス(↑↓ でラップする)。
    this.focusedChoiceIndex = (this.focusedChoiceIndex + delta + count) % count
  }

  focus(index: number): void {
    if (this.phase !== 'choices') return
    if (index < 0 || index >= this.script.choices.length) return
    this.focusedChoiceIndex = index
  }

  confirm(): DialogueOutcome {
    if (this.phase !== 'choices') return { kind: 'continue' }

    const choice = this.script.choices[this.focusedChoiceIndex]
    if (!choice) return { kind: 'continue' }

    if (choice.closingLines && choice.closingLines.length > 0) {
      // 締めセリフを表示してから分岐を確定する(「またあとで」→「おう、また来な!」)。
      this.phase = 'closing'
      this.currentLines = choice.closingLines
      this.lineIndex = 0
      this.visibleChars = 0
      this.pendingChoiceId = choice.id
      this.focusedChoiceIndex = -1
      return { kind: 'continue' }
    }

    // 締めセリフのない選択肢(「遊んでいく」)は即座に確定する。
    this.phase = 'done'
    return { kind: 'choice', choiceId: choice.id }
  }

  abort(): DialogueOutcome {
    this.phase = 'done'
    this.pendingChoiceId = null
    return { kind: 'aborted' }
  }

  view(): DialogueView {
    const active = this.phase !== 'done'
    const showingChoices = this.phase === 'choices'
    const text = this.currentLineText()
    const visibleCount = Math.floor(this.visibleChars)
    const visibleText = active && !showingChoices ? text.slice(0, visibleCount) : ''
    const typing = (this.phase === 'intro' || this.phase === 'closing') && visibleCount < text.length

    const choices: readonly DialogueChoice[] = showingChoices
      ? this.script.choices.map((c) => toChoice(c))
      : []

    return {
      speaker: active ? this.currentSpeaker() : '',
      text: active && !showingChoices ? text : '',
      visibleText,
      typing,
      choices,
      focusedChoiceIndex: showingChoices ? this.focusedChoiceIndex : -1,
      active,
    }
  }

  // --- 内部 ---

  private currentLine(): DialogueLine | undefined {
    return this.currentLines[this.lineIndex]
  }

  private currentLineText(): string {
    return this.currentLine()?.text ?? ''
  }

  private currentSpeaker(): string {
    return this.currentLine()?.speaker ?? ''
  }
}

/** 内部の選択肢定義を core の DialogueChoice(表示用)へ変換する。 */
function toChoice(def: DialogueChoiceDef): DialogueChoice {
  return { id: def.id, label: def.label }
}

/**
 * 合成点(App.tsx / main.tsx)から注入する具象 DialogueController を生成する。
 * 既定で GDD §3.1 の金魚すくい屋台・初回会話を用いる。
 */
export function createGoldfishStallDialogue(): DialogueController {
  return new GoldfishStallDialogue()
}
