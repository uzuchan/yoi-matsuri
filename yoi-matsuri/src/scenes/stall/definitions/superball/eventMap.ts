/**
 * SuperballEvent 記述子 + 入力エッジ を発火指示へ写像する純TS(three/react/DOM 非依存)。
 * 金魚の eventMap(scenes/goldfish/eventMap.ts)と同設計。SCOOP 原型なので効果音は金魚の SFX を流用する
 * (catch/secure/paper-warning/paper-tear/poi-dip/poi-lift。こぼれは汎用すくい音 fish-escape を流用)。
 *
 * 終了は 'stall-finished' 記述子へ集約し、シーンが StallResult を組んで 'stall:finished' を 1 回だけ発火する
 * (二重発火ガードは基盤側 / StallFramework §1.3)。
 */
import type { SuperballEvent } from '../../../../game/superball'
import type { StallResult } from '../../../../game/stall'

/** シーンが処理する 1 件の発火指示。 */
export type SuperballEmit =
  | { readonly event: 'sfx:play'; readonly payload: { name: string } }
  | { readonly event: 'stall-finished'; readonly result: StallResult }

/** submerge の前後フレーム状態から poi-dip / poi-lift の発火指示を返す。 */
export function mapSuperballSubmergeEdge(prev: boolean, next: boolean): SuperballEmit[] {
  if (!prev && next) return [{ event: 'sfx:play', payload: { name: 'poi-dip' } }]
  if (prev && !next) return [{ event: 'sfx:play', payload: { name: 'poi-lift' } }]
  return []
}

/** 1 件の SuperballEvent を発火指示列へ写像する。 */
export function mapSuperballEvent(ev: SuperballEvent): SuperballEmit[] {
  switch (ev.type) {
    case 'caught':
      return [{ event: 'sfx:play', payload: { name: 'catch' } }]
    case 'secured':
      return [{ event: 'sfx:play', payload: { name: 'secure' } }]
    case 'ball-spill':
      return [{ event: 'sfx:play', payload: { name: 'fish-escape' } }]
    case 'paper-warning':
      return [{ event: 'sfx:play', payload: { name: 'paper-warning' } }]
    case 'poi-torn':
      return [{ event: 'sfx:play', payload: { name: 'paper-tear' } }]
    case 'stall-finished':
      return [{ event: 'stall-finished', result: ev.result }]
  }
}

/** SuperballEvent 配列をまとめて発火指示列へ写像する(順序を保つ)。 */
export function mapSuperballEvents(events: readonly SuperballEvent[]): SuperballEmit[] {
  const out: SuperballEmit[] = []
  for (const ev of events) {
    for (const ins of mapSuperballEvent(ev)) out.push(ins)
  }
  return out
}
