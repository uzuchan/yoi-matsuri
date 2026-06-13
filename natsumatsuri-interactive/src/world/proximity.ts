/**
 * 屋台近接判定の純TSロジック(描画・イベント非依存・テスト可能)。
 * プレイヤーが屋台の interactRadius 以内へ入った/出た「瞬間」だけを検出する
 * エッジ判定を行う。連続発火(滞在中・圏外滞在中の再発火)を起こさない。
 *
 * イベントの発火そのもの(EventBus.emit)は呼び出し側(ApproachScene)の責務。
 * ここは「いま enter / leave のどちらのエッジが立ったか」を返すだけにして、
 * three や core/EventBus に依存せず Vitest で単体検証できるようにする。
 */

import type { Vec2 } from './movement'

/** GDD §2 近接プロンプトの半径。 */
export const INTERACT_RADIUS = 3.0 // m

/**
 * 近接状態のトラッカー。圏内/圏外の現在状態を保持し、update で前回との差(エッジ)を返す。
 * 同一状態が続く限り 'none' を返す(単発発火の保証)。
 */
export class ProximityTracker {
  private inside = false
  private readonly radiusSq: number

  constructor(radius: number = INTERACT_RADIUS) {
    this.radiusSq = radius * radius
  }

  /** いま圏内か。 */
  get isInside(): boolean {
    return this.inside
  }

  /**
   * プレイヤー位置と屋台位置から圏内判定を更新し、状態が変化したエッジを返す。
   * - 'enter': 圏外→圏内に変わった瞬間(この1回だけ)
   * - 'leave': 圏内→圏外に変わった瞬間(この1回だけ)
   * - 'none' : 状態変化なし(滞在中・圏外滞在中)
   *
   * 境界(distance == radius)は「圏内」に含める(<=)。
   */
  update(player: Vec2, stall: Vec2): ProximityEdge {
    const dx = player.x - stall.x
    const dz = player.z - stall.z
    const nowInside = dx * dx + dz * dz <= this.radiusSq
    if (nowInside === this.inside) return 'none'
    this.inside = nowInside
    return nowInside ? 'enter' : 'leave'
  }

  /** 状態を圏外へ戻す(再入場時のリセット用)。エッジは返さない。 */
  reset(): void {
    this.inside = false
  }
}

export type ProximityEdge = 'enter' | 'leave' | 'none'
