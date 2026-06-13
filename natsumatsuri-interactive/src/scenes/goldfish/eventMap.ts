/**
 * GoldfishEvent 記述子(T-005)+ 入力エッジ を EventBus / sfx:play への発火指示へ写像する
 * 純TS(three/react/DOM 非依存)。T-006 AC7。
 *
 * 設計:
 *  - 写像は副作用を持たない純関数。GoldfishScene が結果(EmitInstruction[])を
 *    順に EventBus.emit するだけ(発火は単一経路)。これにより二重発火/取りこぼしを
 *    unit test で固定できる(Risk(2))。
 *  - sfx:play(catch/secure/fish-escape/paper-warning/paper-tear)は GoldfishEvent から。
 *  - poi-dip / poi-lift は submerge の立ち上がり/立ち下がりエッジから(GoldfishEvent には無い)。
 *  - GameEvents(goldfish:caught / goldfish:poi-torn / goldfish:finished)も GoldfishEvent から。
 *
 * 写像表(AUDIO_SPEC §4 / GameEvents):
 *  caught       → sfx:play 'catch' + goldfish:caught{total}
 *  secured      → sfx:play 'secure'
 *  fish-escape  → sfx:play 'fish-escape'
 *  paper-warning→ sfx:play 'paper-warning'
 *  poi-torn     → sfx:play 'paper-tear' + goldfish:poi-torn
 *  finished     → goldfish:finished{caught, reason}
 *  submerge↑    → sfx:play 'poi-dip'
 *  submerge↓    → sfx:play 'poi-lift'
 */
import type { GoldfishEvent } from '../../game/goldfish'

/** EventBus へ発火する 1 件の指示(GoldfishScene が emit する)。 */
export type EmitInstruction =
  | { readonly event: 'sfx:play'; readonly payload: { name: string } }
  | { readonly event: 'goldfish:caught'; readonly payload: { total: number } }
  | { readonly event: 'goldfish:poi-torn'; readonly payload: Record<string, never> }
  | {
      readonly event: 'goldfish:finished'
      readonly payload: { caught: number; reason: 'torn' | 'timeout' | 'quit' }
    }

/** submerge の前後フレーム状態から poi-dip / poi-lift の発火指示を返す。 */
export function mapSubmergeEdge(prev: boolean, next: boolean): EmitInstruction[] {
  if (!prev && next) return [{ event: 'sfx:play', payload: { name: 'poi-dip' } }]
  if (prev && !next) return [{ event: 'sfx:play', payload: { name: 'poi-lift' } }]
  return []
}

/** 1 件の GoldfishEvent を発火指示列へ写像する。 */
export function mapGoldfishEvent(ev: GoldfishEvent): EmitInstruction[] {
  switch (ev.type) {
    case 'caught':
      return [
        { event: 'sfx:play', payload: { name: 'catch' } },
        { event: 'goldfish:caught', payload: { total: ev.total } },
      ]
    case 'secured':
      return [{ event: 'sfx:play', payload: { name: 'secure' } }]
    case 'fish-escape':
      return [{ event: 'sfx:play', payload: { name: 'fish-escape' } }]
    case 'paper-warning':
      return [{ event: 'sfx:play', payload: { name: 'paper-warning' } }]
    case 'poi-torn':
      return [
        { event: 'sfx:play', payload: { name: 'paper-tear' } },
        { event: 'goldfish:poi-torn', payload: {} },
      ]
    case 'finished':
      return [
        {
          event: 'goldfish:finished',
          payload: { caught: ev.caught, reason: ev.reason },
        },
      ]
  }
}

/** GoldfishEvent 配列をまとめて発火指示列へ写像する(順序を保つ)。 */
export function mapGoldfishEvents(events: readonly GoldfishEvent[]): EmitInstruction[] {
  const out: EmitInstruction[] = []
  for (const ev of events) {
    for (const ins of mapGoldfishEvent(ev)) out.push(ins)
  }
  return out
}
