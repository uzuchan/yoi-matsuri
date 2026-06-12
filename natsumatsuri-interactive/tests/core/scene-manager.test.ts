import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../src/core/EventBus'
import { InputManager } from '../../src/core/InputManager'
import { SceneManager } from '../../src/core/SceneManager'
import type { Scene, SceneContext, SceneId } from '../../src/core/SceneManager'

interface TestScene {
  scene: Scene
  enter: ReturnType<typeof vi.fn>
  exit: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

function createTestScene(id: SceneId): TestScene {
  const enter = vi.fn()
  const exit = vi.fn()
  const update = vi.fn()
  const render = vi.fn()
  return { scene: { id, enter, exit, update, render }, enter, exit, update, render }
}

function createManager() {
  const events = new EventBus()
  const input = new InputManager()
  return { manager: new SceneManager(events, input), events, input }
}

describe('SceneManager', () => {
  it('startで登録済みシーンがアクティブになり、enterにコンテキストが渡る', () => {
    const { manager, events, input } = createManager()
    const approach = createTestScene('approach')
    manager.register(approach.scene)

    manager.start('approach', { spawn: 'gate' })

    expect(manager.current).toBe('approach')
    expect(approach.enter).toHaveBeenCalledTimes(1)
    const ctx = approach.enter.mock.calls[0][0] as SceneContext
    expect(ctx.events).toBe(events)
    expect(ctx.input).toBe(input)
    expect(ctx.payload).toEqual({ spawn: 'gate' })
  })

  it('許可された遷移でcurrentが更新され、旧シーンexit→新シーンenterの順で呼ばれる', () => {
    const { manager } = createManager()
    const approach = createTestScene('approach')
    const dialogue = createTestScene('dialogue')
    const order: string[] = []
    approach.exit.mockImplementation(() => order.push('approach:exit'))
    dialogue.enter.mockImplementation(() => order.push('dialogue:enter'))
    manager.register(approach.scene)
    manager.register(dialogue.scene)
    manager.start('approach')

    manager.transition('dialogue')

    expect(manager.current).toBe('dialogue')
    expect(order).toEqual(['approach:exit', 'dialogue:enter'])
  })

  it('不正な遷移(approach→result)はthrowし、currentは変わらずexitも呼ばれない', () => {
    const { manager } = createManager()
    const approach = createTestScene('approach')
    const result = createTestScene('result')
    manager.register(approach.scene)
    manager.register(result.scene)
    manager.start('approach')

    expect(() => manager.transition('result')).toThrow(/不正な遷移/)
    expect(manager.current).toBe('approach')
    expect(approach.exit).not.toHaveBeenCalled()
    expect(result.enter).not.toHaveBeenCalled()
  })

  it('未登録シーンへの遷移はthrowする(遷移表上は許可されていても)', () => {
    const { manager } = createManager()
    const approach = createTestScene('approach')
    manager.register(approach.scene)
    manager.start('approach')

    expect(() => manager.transition('dialogue')).toThrow(/未登録/)
    expect(manager.current).toBe('approach')
  })

  it("遷移時に'scene:transition'イベントが{from, to}付きで発火する", () => {
    const { manager, events } = createManager()
    const approach = createTestScene('approach')
    const dialogue = createTestScene('dialogue')
    manager.register(approach.scene)
    manager.register(dialogue.scene)
    manager.start('approach')
    const handler = vi.fn()
    events.on('scene:transition', handler)

    manager.transition('dialogue')

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ from: 'approach', to: 'dialogue' })
  })

  it('ゲーム一周(approach→dialogue→goldfish→result→approach)が遷移表で許可されている', () => {
    const { manager } = createManager()
    const ids: SceneId[] = ['approach', 'dialogue', 'goldfish', 'result']
    const scenes = ids.map((id) => createTestScene(id))
    for (const testScene of scenes) manager.register(testScene.scene)
    manager.start('approach')

    manager.transition('dialogue')
    manager.transition('goldfish')
    manager.transition('result')
    manager.transition('approach')

    expect(manager.current).toBe('approach')
  })

  it('同一IDの二重登録・start前のcurrent/transition・二重startはthrowする', () => {
    const { manager } = createManager()
    const approach = createTestScene('approach')
    manager.register(approach.scene)

    expect(() => manager.register(createTestScene('approach').scene)).toThrow(/登録済み/)
    expect(() => manager.current).toThrow(/start/)
    expect(() => manager.transition('dialogue')).toThrow(/start/)

    manager.start('approach')
    expect(() => manager.start('approach')).toThrow(/開始済み/)
  })

  it('update/renderはアクティブシーンへ委譲される', () => {
    const { manager } = createManager()
    const approach = createTestScene('approach')
    manager.register(approach.scene)
    manager.start('approach')

    manager.update(1 / 60)
    manager.render(0.5)

    expect(approach.update).toHaveBeenCalledWith(1 / 60)
    expect(approach.render).toHaveBeenCalledWith(0.5)
  })
})
