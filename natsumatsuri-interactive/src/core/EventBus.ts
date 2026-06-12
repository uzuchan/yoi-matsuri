import type { SceneId } from './SceneManager'

/**
 * ゲーム全体の型付きイベントマップ(TECHNICAL_ARCHITECTURE §3)。
 * イベントを増やす場合は必ずこのマップに追記する(stringイベントの野放し禁止)。
 */
export interface GameEvents {
  'scene:transition': { from: SceneId; to: SceneId }
  'stall:approach': { stallId: string }
  'stall:leave': { stallId: string }
  'dialogue:choice': { choiceId: string }
  'goldfish:caught': { total: number }
  'goldfish:poi-torn': Record<string, never>
  'goldfish:finished': { caught: number; reason: 'torn' | 'timeout' | 'quit' }
  'sfx:play': { name: string }
}

export type GameEventName = keyof GameEvents

export type EventHandler<K extends GameEventName> = (payload: GameEvents[K]) => void

type AnyHandler = (payload: GameEvents[GameEventName]) => void

/**
 * 型付きpub/sub。モジュール間通信はすべてこのEventBus経由で行う。
 */
export class EventBus {
  private readonly handlers = new Map<GameEventName, Set<AnyHandler>>()

  /** 購読を登録する。戻り値は購読解除関数。 */
  on<K extends GameEventName>(event: K, handler: EventHandler<K>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as AnyHandler)
    return () => this.off(event, handler)
  }

  /** 購読を解除する。未登録のhandlerは無視する。 */
  off<K extends GameEventName>(event: K, handler: EventHandler<K>): void {
    this.handlers.get(event)?.delete(handler as AnyHandler)
  }

  /** イベントを発火する。購読者がいなければ何もしない。 */
  emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    // emit中のon/offで反復が壊れないようスナップショットを回す
    for (const handler of [...set]) {
      ;(handler as EventHandler<K>)(payload)
    }
  }
}
