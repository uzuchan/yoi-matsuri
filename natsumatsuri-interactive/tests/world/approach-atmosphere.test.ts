import { Vector2 } from 'three'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ApproachScene } from '../../src/scenes/approach/ApproachScene'
import { EventBus } from '../../src/core/EventBus'
import type { GameEventName, GameEvents } from '../../src/core/EventBus'
import type { InputManager } from '../../src/core/InputManager'
import { STALL_POSITION } from '../../src/world/stall'
import { FOOTSTEP_INTERVAL } from '../../src/world/atmosphere'

/**
 * ApproachScene の T-009 雰囲気演出の発火配線を、実 EventBus で検証する統合テスト。
 * 花火(fireworks:launch/burst)・足音(sfx:play{footstep})・近接音(sfx:play{prompt})が
 * 正しいタイミングで EventBus へ発火されることを固定する(音そのものは audio が購読して鳴らす)。
 *
 * DOM(promptLabel の canvas / window.innerWidth)と WebGLRenderer は dispose.test.ts と
 * 同様に最小モックで代替する(node 環境)。
 */
beforeAll(() => {
  const fake2dContext = {
    clearRect: () => {},
    strokeText: () => {},
    fillText: () => {},
    font: '',
    textAlign: '',
    textBaseline: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
  }
  const g = globalThis as unknown as { document?: unknown; window?: unknown }
  g.document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`)
      return {
        width: 0,
        height: 0,
        getContext: (type: string) => (type === '2d' ? fake2dContext : null),
      }
    },
  }
  g.window = { innerWidth: 1280, innerHeight: 720 }
})

afterAll(() => {
  const g = globalThis as unknown as { document?: unknown; window?: unknown }
  delete g.document
  delete g.window
})

function createFakeRenderer() {
  return {
    getSize: (target: Vector2) => target.set(1280, 720),
    render: vi.fn(),
  } as unknown as ConstructorParameters<typeof ApproachScene>[0]
}

/** isDown / mouse のみを公開する最小 InputManager スタブ(ポーリング読み取り)。 */
function createFakeInput(state: {
  keys?: Set<string>
  mouse?: { x: number; y: number; pressed: boolean }
}): InputManager {
  const keys = state.keys ?? new Set<string>()
  const mouse = state.mouse ?? { x: 640, y: 360, pressed: false }
  return {
    isDown: (k: string) => keys.has(k),
    get mouse() {
      return mouse
    },
  } as unknown as InputManager
}

/** イベントを記録するヘルパ。 */
function record<K extends GameEventName>(bus: EventBus, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = []
  bus.on(name, (p) => out.push(p))
  return out
}

describe('ApproachScene T-009: 花火の発火と launch→burst 同期', () => {
  it('初回 launch(〜10s)で fireworks:launch、約1.2s後に fireworks:burst を発火する', () => {
    const bus = new EventBus()
    const input = createFakeInput({})
    const launches = record(bus, 'fireworks:launch')
    const bursts = record(bus, 'fireworks:burst')

    const scene = new ApproachScene(createFakeRenderer())
    scene.enter({ events: bus, input })

    // 初回 delay(8s)まで進めると launch が1回発火する。
    for (let i = 0; i < 9 * 60; i++) scene.update(1 / 60)
    expect(launches.length).toBe(1)

    // launch の約1.2s後までに burst が1回発火する(視覚と音の同期)。
    for (let i = 0; i < 2 * 60; i++) scene.update(1 / 60)
    expect(bursts.length).toBe(1)

    // payload は three 非依存のプレーン型(色 + 位置)で、launch と burst の位置・色が一致。
    expect(typeof launches[0].color).toBe('string')
    expect(launches[0].position).toEqual(bursts[0].position)
    expect(launches[0].color).toBe(bursts[0].color)

    scene.dispose()
  })
})

describe('ApproachScene T-009: 足音(0.45s間隔・移動中のみ)', () => {
  it('停止中は footstep を発火しない', () => {
    const bus = new EventBus()
    const input = createFakeInput({}) // キー無し = 停止
    const sfx = record(bus, 'sfx:play')

    const scene = new ApproachScene(createFakeRenderer())
    scene.enter({ events: bus, input })
    for (let i = 0; i < 60; i++) scene.update(1 / 60)
    expect(sfx.filter((s) => s.name === 'footstep')).toHaveLength(0)
    scene.dispose()
  })

  it('前進中は約0.45s間隔で footstep を発火する', () => {
    const bus = new EventBus()
    const input = createFakeInput({ keys: new Set(['KeyW']) }) // 前進
    const sfx = record(bus, 'sfx:play')

    const scene = new ApproachScene(createFakeRenderer())
    scene.enter({ events: bus, input })

    // 2 秒前進(プレイヤー初期 z=4、前進で -Z。壁にぶつからない範囲)。
    const seconds = 2
    for (let i = 0; i < seconds * 60; i++) scene.update(1 / 60)

    const steps = sfx.filter((s) => s.name === 'footstep').length
    // 踏み出し1歩 + 2s / 0.45s ≈ 4〜5歩 → 合計 5〜6歩程度(±1)。
    const expected = 1 + Math.floor(seconds / FOOTSTEP_INTERVAL)
    expect(steps).toBeGreaterThanOrEqual(expected - 1)
    expect(steps).toBeLessThanOrEqual(expected + 1)
    scene.dispose()
  })
})

describe('ApproachScene T-009: 近接プロンプト音(enter時1回・連続発火なし)', () => {
  it('近接圏に入った瞬間に prompt を1回(stall:approach と同時)、圏内滞在中は連続発火しない', () => {
    const bus = new EventBus()
    // 屋台(STALL_POSITION)へ向かって前進し続ける入力(マウス押下で屋台方向収束)。
    const input = createFakeInput({ mouse: { x: 640, y: 360, pressed: true } })
    const sfx = record(bus, 'sfx:play')
    const approaches = record(bus, 'stall:approach')

    const scene = new ApproachScene(createFakeRenderer())
    scene.enter({ events: bus, input })

    // マウス押下で屋台方向へ前進 → 近接圏(3m)へ入るまで十分進める(屋台は z≈-26、約30m先)。
    for (let i = 0; i < 20 * 60; i++) scene.update(1 / 60)

    const prompts = sfx.filter((s) => s.name === 'prompt').length
    // 近接 enter は1回、prompt も1回(連続発火なし)。
    expect(approaches.length).toBe(1)
    expect(prompts).toBe(1)
    scene.dispose()
  })
})

describe('ApproachScene T-009: STALL_POSITION 参照(回帰)', () => {
  it('屋台位置は world から参照する固定座標', () => {
    expect(STALL_POSITION).toEqual({ x: 5, z: -26 })
  })
})
