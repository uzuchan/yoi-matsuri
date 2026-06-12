import { describe, expect, it } from 'vitest'
import { GAME_KEYS, InputManager } from '../../src/core/InputManager'

type Listener = (event: Event) => void

/**
 * window代替の最小モック(node環境で実行するためjsdomは使わない)。
 * addEventListener/removeEventListenerと手動dispatchのみを提供する。
 */
class MockEventTarget {
  readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: object = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event as Event)
    }
  }

  get totalListenerCount(): number {
    let count = 0
    for (const set of this.listeners.values()) count += set.size
    return count
  }
}

function createAttached() {
  const target = new MockEventTarget()
  const input = new InputManager()
  input.attach(target)
  return { target, input }
}

describe('InputManager', () => {
  it('keydown/keyupでキー押下状態が更新される', () => {
    const { target, input } = createAttached()

    expect(input.isDown('KeyW')).toBe(false)
    target.dispatch('keydown', { code: 'KeyW' })
    expect(input.isDown('KeyW')).toBe(true)

    target.dispatch('keyup', { code: 'KeyW' })
    expect(input.isDown('KeyW')).toBe(false)
  })

  it('WASD/矢印/E/Space/Escの全ゲームキーが追跡される', () => {
    const { target, input } = createAttached()

    for (const key of GAME_KEYS) {
      target.dispatch('keydown', { code: key })
      expect(input.isDown(key), key).toBe(true)
      target.dispatch('keyup', { code: key })
      expect(input.isDown(key), key).toBe(false)
    }
  })

  it('追跡対象外のキーは状態に影響しない', () => {
    const { target, input } = createAttached()

    target.dispatch('keydown', { code: 'KeyQ' })
    target.dispatch('keydown', { code: 'Enter' })

    for (const key of GAME_KEYS) {
      expect(input.isDown(key)).toBe(false)
    }
  })

  it('マウスの移動・押下・解放が公開状態に反映される', () => {
    const { target, input } = createAttached()

    target.dispatch('mousemove', { clientX: 120, clientY: 80 })
    expect(input.mouse).toEqual({ x: 120, y: 80, pressed: false })

    target.dispatch('mousedown', { button: 0 })
    expect(input.mouse.pressed).toBe(true)

    target.dispatch('mouseup', { button: 0 })
    expect(input.mouse.pressed).toBe(false)
  })

  it('主ボタン以外のmousedownはpressedに影響しない', () => {
    const { target, input } = createAttached()

    target.dispatch('mousedown', { button: 2 })
    expect(input.mouse.pressed).toBe(false)
  })

  it('detachで全リスナーが解除され、状態もリセットされる', () => {
    const { target, input } = createAttached()
    target.dispatch('keydown', { code: 'KeyE' })
    target.dispatch('mousedown', { button: 0 })
    expect(target.totalListenerCount).toBeGreaterThan(0)

    input.detach()

    expect(target.totalListenerCount).toBe(0)
    expect(input.isDown('KeyE')).toBe(false)
    expect(input.mouse.pressed).toBe(false)

    // detach後のイベントは無視される
    target.dispatch('keydown', { code: 'KeyE' })
    expect(input.isDown('KeyE')).toBe(false)
  })

  it('blurで押下中のキーが全解除される(押しっぱなし防止)', () => {
    const { target, input } = createAttached()
    target.dispatch('keydown', { code: 'KeyW' })
    target.dispatch('keydown', { code: 'Space' })

    target.dispatch('blur')

    expect(input.isDown('KeyW')).toBe(false)
    expect(input.isDown('Space')).toBe(false)
  })

  it('attachし直すと旧ターゲットのリスナーは解除される', () => {
    const { target, input } = createAttached()
    const nextTarget = new MockEventTarget()

    input.attach(nextTarget)

    expect(target.totalListenerCount).toBe(0)
    nextTarget.dispatch('keydown', { code: 'KeyD' })
    expect(input.isDown('KeyD')).toBe(true)
  })
})
