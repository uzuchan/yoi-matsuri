import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../src/core'
import { AudioEngine } from '../../src/audio'

/**
 * AudioEngine の「AudioContext 非依存」な振る舞いの unit test(T-008 AC7)。
 * node/test 環境(AudioContext 無し)で:
 *  - install/resume/dispose が例外を投げず no-op で安全であること
 *  - EventBus を購読し、first-gesture リスナを target へ張る/外すこと
 *  - 各イベント発火で落ちないこと(音は出ないが機能不全エラー 0)
 */

// addEventListener/removeEventListener を記録する最小の gesture target。
function makeGestureTarget() {
  const listeners = new Map<string, Set<EventListener>>()
  return {
    listeners,
    addEventListener(type: string, h: EventListener) {
      let s = listeners.get(type)
      if (!s) listeners.set(type, (s = new Set()))
      s.add(h)
    },
    removeEventListener(type: string, h: EventListener) {
      listeners.get(type)?.delete(h)
    },
    fire(type: string) {
      for (const h of listeners.get(type) ?? []) h(new Event(type))
    },
    count() {
      let n = 0
      for (const s of listeners.values()) n += s.size
      return n
    },
  }
}

describe('AudioEngine(AudioContext 無し環境での安全性)', () => {
  it('install しても AudioContext は作らず例外も出ない(autoplay 対応・遅延生成)', () => {
    const events = new EventBus()
    const engine = new AudioEngine()
    expect(() => engine.install(events)).not.toThrow()
    expect(engine.contextState).toBeNull() // まだ生成していない
    engine.dispose()
  })

  it('first-gesture リスナを張り、resume 後に解除する', async () => {
    const events = new EventBus()
    const engine = new AudioEngine()
    const target = makeGestureTarget()
    engine.install(events, target)
    // pointerdown / keydown / touchstart の3種を張る。
    expect(target.count()).toBe(3)

    // ジェスチャを発火 → resume(未対応環境では no-op だがリスナは外れる)。
    target.fire('pointerdown')
    await Promise.resolve()
    expect(target.count()).toBe(0)
    engine.dispose()
  })

  it('購読イベントを発火しても例外を投げない(機能不全エラー0)', () => {
    const events = new EventBus()
    const engine = new AudioEngine()
    engine.install(events)
    expect(() => {
      events.emit('sfx:play', { name: 'interact' })
      events.emit('sfx:play', { name: 'unknown-name' })
      events.emit('stall:approach', { stallId: 'goldfish-stall' })
      events.emit('stall:leave', { stallId: 'goldfish-stall' })
      events.emit('scene:transition', { from: 'approach', to: 'goldfish' })
      events.emit('scene:transition', { from: 'goldfish', to: 'result' })
      events.emit('fireworks:launch', { color: '#ffd56b', position: { x: 0, y: 12, z: -8 } })
      events.emit('fireworks:burst', { color: '#ffd56b', position: { x: 0, y: 18, z: -8 } })
    }).not.toThrow()
    engine.dispose()
  })

  it('fireworks:launch / fireworks:burst を購読し playFireworks へ写像する(T-009)', () => {
    const events = new EventBus()
    const engine = new AudioEngine()
    const target = engine as unknown as { playFireworks: (k: 'launch' | 'burst') => void }
    const spy = vi.spyOn(target, 'playFireworks')
    engine.install(events)

    events.emit('fireworks:launch', { color: '#ffd56b', position: { x: 1, y: 12, z: -8 } })
    events.emit('fireworks:burst', { color: '#ffd56b', position: { x: 1, y: 18, z: -8 } })
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['launch', 'burst'])

    // dispose 後は届かない(購読解除)。
    engine.dispose()
    events.emit('fireworks:launch', { color: '#ff5b5b', position: { x: 0, y: 12, z: -8 } })
    expect(spy.mock.calls).toHaveLength(2)
    spy.mockRestore()
  })

  it('dispose は購読を解除する(以後の発火がハンドラに届かない)', () => {
    const events = new EventBus()
    const engine = new AudioEngine()
    // private playSfx をスパイして「購読が活きているか」を観測する(no-op 環境でも呼び出し回数で判定可能)。
    const target = engine as unknown as { playSfx: (n: string) => void }
    const spy = vi.spyOn(target, 'playSfx')
    engine.install(events)
    events.emit('sfx:play', { name: 'select' })
    const callsBefore = spy.mock.calls.length
    expect(callsBefore).toBe(1) // 購読中は届く
    engine.dispose()
    events.emit('sfx:play', { name: 'select' })
    expect(spy.mock.calls.length).toBe(callsBefore) // dispose 後は増えない
    spy.mockRestore()
  })

  it('dispose は冪等(二重 dispose で落ちない)', () => {
    const engine = new AudioEngine()
    engine.install(new EventBus())
    expect(() => {
      engine.dispose()
      engine.dispose()
    }).not.toThrow()
  })
})
