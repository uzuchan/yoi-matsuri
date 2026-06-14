import type { SceneId } from './SceneManager'
import type { DialogueView } from './Dialogue'

/**
 * 屋台プレイの最終成果(EventBus に載せる純データ / D-010)。
 *
 * 純TS の遊び契約 game/stall の StallResult と **構造的に一致**させる(core は game に依存できないため
 * core 側で同形を定義する。game の StallResult は本型へ構造的に代入可能)。屋台横断の終了理由・スコアを
 * 運ぶ。屋台固有の演出イベント(caught/torn 等)は EventBus に載せず Scene 内 listener / sfx:play で
 * 処理する(GameEvents 型を屋台ごとに膨らませない / D-006)。
 */
export interface StallFinishedResult {
  readonly score: number
  readonly reason: 'success' | 'timeout' | 'broke' | 'quit'
  readonly metrics?: Readonly<Record<string, number>>
}

/**
 * ゲーム全体の型付きイベントマップ(TECHNICAL_ARCHITECTURE §3 / D-010)。
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
  /**
   * 屋台ミニゲームが終了した(D-010。goldfish:caught/poi-torn/finished の集約後継)。
   * 合成点が購読して result へ遷移し、result.resultRules で score→{tier/見出し/セリフ/報酬} を解決する。
   * 屋台固有の演出(捕獲数 HUD・破損音)は Scene 内 listener / sfx:play で処理し、本イベントには載せない。
   */
  'stall:finished': { stallId: string; result: StallFinishedResult }
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
