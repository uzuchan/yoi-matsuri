import { Vector2 } from 'three'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ApproachScene } from '../../src/scenes/approach/ApproachScene'
import { createCrowd } from '../../src/world/crowd'
import { createGround } from '../../src/world/ground'
import { createLanterns } from '../../src/world/lanterns'
import { createLighting } from '../../src/world/lighting'
import { createSky } from '../../src/world/sky'
import { createStall } from '../../src/world/stall'
import { createTorii } from '../../src/world/torii'
import { computeLanternAnchors, pickRepresentativeLanterns } from '../../src/world/lanterns'
import type { WorldObject } from '../../src/world/types'

/**
 * ApproachScene はワールド空間プロンプト(promptLabel)生成のため canvas を、
 * 追従カメラのマウス視線追従のため window.innerWidth を参照する。
 * unit test は DOM 非依存(node 環境)のため、ここで最小モックを与える
 * (vitest.config.ts の方針「DOMが必要な箇所はテスト側で最小モック」に従う)。
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
  const g = globalThis as unknown as {
    document?: unknown
    window?: unknown
  }
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

/**
 * ApproachScene の構築時に必要な WebGLRenderer の最小モック。
 * 構築時に呼ばれるのは getSize のみ。render はテストでは呼ばない。
 */
function createFakeRenderer() {
  return {
    getSize: (target: Vector2) => target.set(1280, 720),
    render: vi.fn(),
  } as unknown as ConstructorParameters<typeof ApproachScene>[0]
}

describe('WorldObject ビルダーの dispose は idempotent(M-2対応)', () => {
  const builders: Array<[string, () => WorldObject]> = [
    ['sky', createSky],
    ['ground', () => createGround([{ x: 0, z: 0, radius: 1 }])],
    ['lanterns', createLanterns],
    ['torii', createTorii],
    ['stall', createStall],
    ['crowd', createCrowd],
    [
      'lighting',
      () => createLighting(pickRepresentativeLanterns(computeLanternAnchors(), 4)),
    ],
  ]

  for (const [name, build] of builders) {
    it(`${name}: dispose を2回呼んでも throw しない`, () => {
      const w = build()
      expect(() => {
        w.dispose()
        w.dispose()
      }).not.toThrow()
    })
  }
})

describe('ApproachScene.dispose()(AC9)', () => {
  it('全 WorldObject の dispose を呼び、シーングラフから外す', () => {
    const scene = new ApproachScene(createFakeRenderer())
    // 内部の scene(ThreeScene)へ到達して子要素の存在を確認する。
    const threeScene = (scene as unknown as { scene: { children: unknown[]; fog: unknown } }).scene
    expect(threeScene.children.length).toBeGreaterThan(0)
    expect(threeScene.fog).not.toBeNull()

    scene.dispose()

    expect(threeScene.children.length).toBe(0)
    expect(threeScene.fog).toBeNull()
  })

  it('dispose を複数回呼んでも安全(idempotent)', () => {
    const scene = new ApproachScene(createFakeRenderer())
    expect(() => {
      scene.dispose()
      scene.dispose()
      scene.dispose()
    }).not.toThrow()
  })

  it('実際に geometry / material の dispose が呼ばれる(GPUリソース解放)', () => {
    const scene = new ApproachScene(createFakeRenderer())
    const threeScene = (
      scene as unknown as { scene: { traverse: (cb: (o: unknown) => void) => void } }
    ).scene

    const disposeSpies: ReturnType<typeof vi.spyOn>[] = []
    threeScene.traverse((obj) => {
      const o = obj as {
        type?: string
        geometry?: { dispose: () => void }
        material?: { dispose: () => void }
      }
      // Sprite(プロンプトラベル)の geometry は three 内部の共有シングルトンで、
      // 個別 dispose は禁止(他 Sprite を壊す)。所有リソースではないので検証対象から除く。
      const isSprite = o.type === 'Sprite'
      if (!isSprite && o.geometry && typeof o.geometry.dispose === 'function') {
        disposeSpies.push(vi.spyOn(o.geometry, 'dispose'))
      }
      if (o.material && typeof o.material.dispose === 'function') {
        disposeSpies.push(vi.spyOn(o.material, 'dispose'))
      }
    })

    expect(disposeSpies.length).toBeGreaterThan(0)
    scene.dispose()
    for (const spy of disposeSpies) {
      expect(spy).toHaveBeenCalled()
    }
  })

  it('update(dt) は dispose 後でなければ throw しない(揺れ駆動)', () => {
    const scene = new ApproachScene(createFakeRenderer())
    expect(() => {
      scene.update(1 / 60)
      scene.update(1 / 60)
    }).not.toThrow()
    scene.dispose()
  })
})
