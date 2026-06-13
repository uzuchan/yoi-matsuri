import type { SceneId } from './SceneManager'
import type { DialogueView } from './Dialogue'

/**
 * ゲーム全体の型付きイベントマップ(TECHNICAL_ARCHITECTURE §3)。
 * イベントを増やす場合は必ずこのマップに追記する(stringイベントの野放し禁止)。
 */
export interface GameEvents {
  'scene:transition': { from: SceneId; to: SceneId }
  'stall:approach': { stallId: string }
  'stall:leave': { stallId: string }
  'dialogue:choice': { choiceId: string }
  /**
   * 会話の表示状態が変化した(T-004/D-008)。DialogueScene が DialogueController の view() を
   * 発火し、HudRoot が購読して React state へ橋渡しする(SceneManager 状態と HUD の単一経路同期)。
   * payload はプレーンな表示状態スナップショット(three/react 非依存)。
   */
  'dialogue:view-changed': { view: DialogueView }
  'goldfish:caught': { total: number }
  'goldfish:poi-torn': Record<string, never>
  'goldfish:finished': { caught: number; reason: 'torn' | 'timeout' | 'quit' }
  'sfx:play': { name: string }
  /**
   * 花火の打ち上げ(T-009)。発火責任は scenes/approach(視覚 = world/fireworks)、購読は audio。
   * payload は three 非依存のプレーン型に限る(色は ART §2 の花火3色のいずれか、位置は world 座標)。
   * 開花は launch から約 1.2s 後に fireworks:burst が続く(発火側で固定。AUDIO_SPEC §3)。
   */
  'fireworks:launch': {
    color: string
    position: { x: number; y: number; z: number }
  }
  /** 花火の開花(T-009)。launch と同じ shell の開花点。視覚の開花と音を同期させる。 */
  'fireworks:burst': {
    color: string
    position: { x: number; y: number; z: number }
  }
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
