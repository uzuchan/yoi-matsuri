/**
 * お面屋セッション(CHOICE 原型 / 屋台#19)。three / react / DOM 非依存の純TS(D-003)。
 *
 * StallSession 契約(game/stall)を実装する選択式セッション。**物理なし**。複数のお面候補から
 * ←→/マウスでフォーカスを動かし、Enter/クリックで確定 → 選んだお面が報酬(MINIGAME_ARCHETYPES §2 #19)。
 *
 * 結果(§1 CHOICE / §タスク方針):
 *  - 選べた = 成功(score=1)。希少なお面 = 大成功(score=2)。失敗概念なし(選択に正誤はない)。
 *  - Esc 退出(選ばずにやめた)のみ score=0(reason=quit。店主は穏当に送り出す)。
 *
 * 決定論(§7 厳守): 候補・フォーカス・確定は入力のみで決まり乱数を使わない(完全に再現可能)。
 */
import { MASK_KINDS } from './params'
import type { StallResult, StallSession, StallSnapshot } from '../stall'

/** 1 フレームの操作入力(シーンが InputManager/ポインタから組み立てて渡す)。 */
export interface MaskInput {
  /** フォーカス移動量(-1=左 / +1=右 / 0=なし)。1 フレームで 1 段だけ動く立ち上がりエッジ。 */
  readonly move: -1 | 0 | 1
  /** ポインタ等で直接フォーカスする候補 index(なければ null)。 */
  readonly focusIndex: number | null
  /** 確定(Enter/クリックの立ち上がり)。true で現在フォーカス中のお面を選ぶ。 */
  readonly confirm?: boolean
  /** 退出要求(Esc)。true で status=quit となり終了する。 */
  readonly quit?: boolean
}

/** update が返す状態変化記述子(EventBus 非依存)。 */
export type MaskEvent =
  /** フォーカスが動いた(→ sfx 'dialogue-select' を流用)。 */
  | { readonly type: 'focus-changed'; readonly index: number }
  /** お面を選んで確定(→ sfx 'confirm')。 */
  | { readonly type: 'chosen'; readonly index: number; readonly maskId: string }
  /** セッション終了。score=選択結果(0=未選択 / 1=通常 / 2=希少)。 */
  | { readonly type: 'stall-finished'; readonly result: StallResult }

/** セッションの公開状態(描画/HUD が読む)。StallSnapshot を満たす。 */
export interface MaskState extends StallSnapshot {
  /** 候補お面の総数。 */
  readonly count: number
  /** 現在フォーカス中の候補 index。 */
  readonly focusedIndex: number
  /** 確定済みの候補 index(未確定は -1)。 */
  readonly chosenIndex: number
}

/**
 * お面屋セッション。物理なしのため dt は使わないが、StallSession 契約に合わせて受け取る。
 */
export class MaskSession implements StallSession<MaskInput, MaskState, MaskEvent> {
  private readonly count = MASK_KINDS.length
  private focusedIndex = 0
  private chosenIndex = -1
  private internalStatus: StallSnapshot['status'] = 'playing'
  private finalResult: StallResult | null = null

  get status(): StallSnapshot['status'] {
    return this.internalStatus
  }

  result(): StallResult | null {
    return this.finalResult
  }

  update(_dt: number, input: MaskInput): readonly MaskEvent[] {
    if (this.internalStatus !== 'playing') return []
    const events: MaskEvent[] = []

    // 0) 退出(選ばずにやめた)。
    if (input.quit) {
      this.finish(null, events)
      return events
    }

    // 1) フォーカス移動(←→ の循環 / ポインタ直接指定)。
    let nextFocus = this.focusedIndex
    if (input.focusIndex !== null && input.focusIndex >= 0 && input.focusIndex < this.count) {
      nextFocus = input.focusIndex
    } else if (input.move !== 0) {
      nextFocus = (this.focusedIndex + input.move + this.count) % this.count
    }
    if (nextFocus !== this.focusedIndex) {
      this.focusedIndex = nextFocus
      events.push({ type: 'focus-changed', index: this.focusedIndex })
    }

    // 2) 確定(現在フォーカスのお面を選ぶ → 報酬・終了)。
    if (input.confirm) {
      this.chosenIndex = this.focusedIndex
      const mask = MASK_KINDS[this.chosenIndex]
      events.push({ type: 'chosen', index: this.chosenIndex, maskId: mask.id })
      this.finish(this.chosenIndex, events)
    }

    return events
  }

  /** セッションを終了させる(選択 index、または null で未選択退出)。 */
  private finish(chosenIndex: number | null, events: MaskEvent[]): void {
    if (chosenIndex === null) {
      this.internalStatus = 'quit'
      this.finalResult = { score: 0, reason: 'quit', metrics: { chosenIndex: -1 } }
    } else {
      const mask = MASK_KINDS[chosenIndex]
      // 選べた=成功(score 1)。希少なお面=大成功(score 2)。失敗概念なし。
      const score = mask.rare ? 2 : 1
      this.internalStatus = 'cleared'
      this.finalResult = { score, reason: 'success', metrics: { chosenIndex } }
    }
    events.push({ type: 'stall-finished', result: this.finalResult })
  }

  snapshot(): MaskState {
    return {
      status: this.internalStatus,
      timeRemaining: -1, // 制限時間なし(汎用 HUD は時間を出さない)
      danger: 0, // 危険度なし(物理なし)
      score: this.chosenIndex >= 0 ? (MASK_KINDS[this.chosenIndex].rare ? 2 : 1) : 0,
      count: this.count,
      focusedIndex: this.focusedIndex,
      chosenIndex: this.chosenIndex,
    }
  }
}
