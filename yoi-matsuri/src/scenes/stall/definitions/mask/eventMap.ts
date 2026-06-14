/**
 * MaskEvent 記述子を発火指示へ写像する純TS(three/react/DOM 非依存)。
 * 効果音は会話系の SFX を流用(フォーカス移動=dialogue-select / 確定=confirm)。
 * 終了は 'stall-finished' へ集約し、シーンが 'stall:finished' を 1 回だけ発火する(§1.3)。
 */
import type { MaskEvent } from '../../../../game/mask'
import type { StallResult } from '../../../../game/stall'

/** シーンが処理する 1 件の発火指示。 */
export type MaskEmit =
  | { readonly event: 'sfx:play'; readonly payload: { name: string } }
  | { readonly event: 'stall-finished'; readonly result: StallResult }

/** 1 件の MaskEvent を発火指示列へ写像する。 */
export function mapMaskEvent(ev: MaskEvent): MaskEmit[] {
  switch (ev.type) {
    case 'focus-changed':
      return [{ event: 'sfx:play', payload: { name: 'dialogue-select' } }]
    case 'chosen':
      return [{ event: 'sfx:play', payload: { name: 'confirm' } }]
    case 'stall-finished':
      return [{ event: 'stall-finished', result: ev.result }]
  }
}

/** MaskEvent 配列をまとめて発火指示列へ写像する(順序を保つ)。 */
export function mapMaskEvents(events: readonly MaskEvent[]): MaskEmit[] {
  const out: MaskEmit[] = []
  for (const ev of events) {
    for (const ins of mapMaskEvent(ev)) out.push(ins)
  }
  return out
}
