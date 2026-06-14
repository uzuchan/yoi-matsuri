import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../src/core/EventBus'
import type { GameKey, InputManager, MouseState, SceneContext } from '../../src/core'
import { MinigameScene, StallRegistry, type StallDefinition } from '../../src/scenes/stall'
import type { StallScene, StallHudState } from '../../src/scenes/stall'
import { GOLDFISH_RESULT_RULES } from '../../src/game/result'

/**
 * MinigameScene ディスパッチャの契約テスト(StallFramework §3.2 / §8.2)。
 * 「enter payload の stallId で正しい StallScene へ委譲」「未登録は throw」
 * 「exit で屋台 Scene を exit→dispose し HUD を閉じる」「HUD listener を橋渡しする」を固定する。
 */

interface SpyScene {
  scene: StallScene
  enter: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  exit: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  emitHud: (s: StallHudState | null) => void
}

function createSpyScene(): SpyScene {
  const enter = vi.fn()
  const update = vi.fn()
  const render = vi.fn()
  const exit = vi.fn()
  const dispose = vi.fn()
  let hudListener: ((s: StallHudState | null) => void) | null = null
  const scene: StallScene = {
    id: 'minigame',
    enter,
    update,
    render,
    exit,
    dispose,
    setHudListener: (l) => {
      hudListener = l
    },
  }
  return { scene, enter, update, render, exit, dispose, emitHud: (s) => hudListener?.(s) }
}

function def(id: string, create: () => StallScene): StallDefinition {
  return {
    id,
    displayName: id,
    placement: { position: { x: 0, z: 0 }, facing: 0, interactRadius: 3, promptY: 2 },
    createScene: create,
    resultRules: GOLDFISH_RESULT_RULES,
  }
}

function fakeInput(): InputManager {
  const mouse: MouseState = { x: 0, y: 0, pressed: false }
  return { isDown: (_k: GameKey) => false, get mouse() { return mouse } } as unknown as InputManager
}

function ctxWith(stallId: string | undefined): SceneContext {
  return {
    events: new EventBus(),
    input: fakeInput(),
    payload: stallId === undefined ? undefined : { stallId },
  }
}

describe('MinigameScene(stallId ディスパッチ / §3.2)', () => {
  it('enter payload の stallId で該当 StallScene を生成し enter を委譲する', () => {
    const registry = new StallRegistry()
    const a = createSpyScene()
    const b = createSpyScene()
    registry.register(def('a', () => a.scene))
    registry.register(def('b', () => b.scene))
    const mg = new MinigameScene({} as never, registry)

    mg.enter(ctxWith('b'))

    expect(b.enter).toHaveBeenCalledTimes(1)
    expect(a.enter).not.toHaveBeenCalled()
    expect(mg.currentStallId).toBe('b')

    mg.update(1 / 60)
    mg.render(0.5)
    expect(b.update).toHaveBeenCalledWith(1 / 60)
    expect(b.render).toHaveBeenCalledWith(0.5)
  })

  it('未登録 stallId / stallId なしは throw する', () => {
    const registry = new StallRegistry()
    const mg = new MinigameScene({} as never, registry)
    expect(() => mg.enter(ctxWith('missing'))).toThrow()
    expect(() => mg.enter(ctxWith(undefined))).toThrow(/stallId/)
  })

  it('exit で屋台 Scene を exit→dispose し、HUD を閉じる(null)', () => {
    const registry = new StallRegistry()
    const a = createSpyScene()
    registry.register(def('a', () => a.scene))
    const mg = new MinigameScene({} as never, registry)
    const hud: (StallHudState | null)[] = []
    mg.setHudListener((s) => hud.push(s))

    mg.enter(ctxWith('a'))
    mg.exit()

    expect(a.exit).toHaveBeenCalledTimes(1)
    expect(a.dispose).toHaveBeenCalledTimes(1)
    expect(mg.currentStallId).toBeNull()
    expect(hud.at(-1)).toBeNull()
  })

  it('屋台 Scene の HUD listener を合成点へ橋渡しする', () => {
    const registry = new StallRegistry()
    const a = createSpyScene()
    registry.register(def('a', () => a.scene))
    const mg = new MinigameScene({} as never, registry)
    const hud: (StallHudState | null)[] = []
    mg.setHudListener((s) => hud.push(s))
    mg.enter(ctxWith('a'))

    const state: StallHudState = {
      active: true,
      displayName: 'a',
      timeRemaining: 10,
      gauge: { ratio: 0.5, label: 'g' },
      score: 1,
      scoreLabel: 's',
      scoreUnit: 'u',
      hint: '',
    }
    a.emitHud(state)
    expect(hud).toContainEqual(state)
  })

  it('別屋台へ enter し直すと新しい StallScene を生成する(遅延生成 / §7)', () => {
    const registry = new StallRegistry()
    const createsA = vi.fn(() => createSpyScene().scene)
    registry.register(def('a', createsA))
    const mg = new MinigameScene({} as never, registry)

    mg.enter(ctxWith('a'))
    mg.exit()
    mg.enter(ctxWith('a'))

    expect(createsA).toHaveBeenCalledTimes(2) // enter 毎に生成(歩行中は屋台中身を持たない)
  })
})
