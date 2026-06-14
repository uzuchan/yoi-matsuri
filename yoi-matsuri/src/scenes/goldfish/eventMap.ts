/**
 * GoldfishEvent 記述子(T-005)+ 入力エッジ を発火指示へ写像する純TS
 * (three/react/DOM 非依存)。T-006 AC7 / StallFramework 移行(D-010)。
 *
 * 設計:
 *  - 写像は副作用を持たない純関数。GoldfishScene が結果(EmitInstruction[])を順に処理する。
 *  - sfx:play(catch/secure/fish-escape/paper-warning/paper-tear)は GoldfishEvent から。
 *  - poi-dip / poi-lift は submerge の立ち上がり/立ち下がりエッジから(GoldfishEvent には無い)。
 *  - **D-010 集約**: 屋台固有 GameEvents(goldfish:caught/poi-torn)は EventBus に載せない
 *    (HUD は listener、破損音は sfx 'paper-tear' で足りる)。終了は 'stall-finished' 記述子へ集約し、
 *    GoldfishScene が StallResult を組んで 'stall:finished' を1回だけ発火する(二重発火ガードは基盤側)。
 *
 * 写像表(AUDIO_SPEC §4):
 *  caught       → sfx:play 'catch'
 *  secured      → sfx:play 'secure'
 *  fish-escape  → sfx:play 'fish-escape'
 *  paper-warning→ sfx:play 'paper-warning'
 *  poi-torn     → sfx:play 'paper-tear'
 *  finished     → stall-finished{ result: StallResult }(reason は torn→broke 等へ正規化)
 *  submerge↑    → sfx:play 'poi-dip'
 *  submerge↓    → sfx:play 'poi-lift'
 */
import type { GoldfishEvent } from '../../game/goldfish'
import type { StallEndReason, StallResult } from '../../game/stall'

/** GoldfishScene が処理する 1 件の発火指示。 */
export type EmitInstruction =
  | { readonly event: 'sfx:play'; readonly payload: { name: string } }
  | { readonly event: 'stall-finished'; readonly result: StallResult }

/** 金魚の終了理由(torn/timeout/quit)を屋台横断の StallEndReason へ正規化する(torn→broke)。 */
export function toStallEndReason(reason: 'torn' | 'timeout' | 'quit'): StallEndReason {
  if (reason === 'torn') return 'broke'
  if (reason === 'timeout') return 'timeout'
  return 'quit'
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
      // 捕獲は効果音のみ。HUD のカウンタは GoldfishScene が snapshot から listener で橋渡しする。
      return [{ event: 'sfx:play', payload: { name: 'catch' } }]
    case 'secured':
      return [{ event: 'sfx:play', payload: { name: 'secure' } }]
    case 'fish-escape':
      return [{ event: 'sfx:play', payload: { name: 'fish-escape' } }]
    case 'paper-warning':
      return [{ event: 'sfx:play', payload: { name: 'paper-warning' } }]
    case 'poi-torn':
      // 破損は効果音のみ(GameEvents 'goldfish:poi-torn' は D-010 で廃止)。
      return [{ event: 'sfx:play', payload: { name: 'paper-tear' } }]
    case 'finished':
      // 終了は屋台横断の StallResult へ集約する(score=確保数 / reason=torn→broke 等)。
      return [
        {
          event: 'stall-finished',
          result: { score: ev.caught, reason: toStallEndReason(ev.reason) },
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
