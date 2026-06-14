import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../src/core/EventBus'

describe('EventBus', () => {
  it('emitで購読ハンドラが型付きペイロードとともに呼ばれる', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('scene:transition', handler)

    bus.emit('scene:transition', { from: 'approach', to: 'dialogue' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ from: 'approach', to: 'dialogue' })
  })

  it('同一イベントの複数ハンドラがすべて呼ばれる', () => {
    // D-010: 屋台固有イベント(goldfish:caught/poi-torn)は stall:finished へ集約。
    const bus = new EventBus()
    const first = vi.fn()
    const second = vi.fn()
    const payload = { stallId: 'goldfish-stall', result: { score: 3, reason: 'broke' as const } }
    bus.on('stall:finished', first)
    bus.on('stall:finished', second)

    bus.emit('stall:finished', payload)

    expect(first).toHaveBeenCalledWith(payload)
    expect(second).toHaveBeenCalledWith(payload)
  })

  it('offで購読解除した後はハンドラが呼ばれない', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('sfx:play', handler)
    bus.emit('sfx:play', { name: 'splash' })

    bus.off('sfx:play', handler)
    bus.emit('sfx:play', { name: 'splash' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('onが返す購読解除関数でも解除できる', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    const unsubscribe = bus.on('stall:approach', handler)

    unsubscribe()
    bus.emit('stall:approach', { stallId: 'goldfish-stall' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('購読者のいないイベントのemitは何も起きない(throwしない)', () => {
    const bus = new EventBus()
    expect(() => bus.emit('stall:leave', { stallId: 'goldfish-stall' })).not.toThrow()
  })

  it('解除は対象のハンドラのみに作用し、他の購読は残る', () => {
    const bus = new EventBus()
    const kept = vi.fn()
    const removed = vi.fn()
    bus.on('dialogue:choice', kept)
    bus.on('dialogue:choice', removed)

    bus.off('dialogue:choice', removed)
    bus.emit('dialogue:choice', { choiceId: 'play' })

    expect(kept).toHaveBeenCalledTimes(1)
    expect(removed).not.toHaveBeenCalled()
  })
})
