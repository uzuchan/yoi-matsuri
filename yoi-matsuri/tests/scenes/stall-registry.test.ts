import { describe, expect, it } from 'vitest'
import { StallRegistry, type StallDefinition } from '../../src/scenes/stall'
import type { StallScene } from '../../src/scenes/stall'
import { GOLDFISH_RESULT_RULES } from '../../src/game/result'

/**
 * StallRegistry の契約テスト(StallFramework §2.3 / §8.2)。
 * register / get / has / getAll と、重複登録・未登録 throw を固定する。
 */

function fakeDef(id: string): StallDefinition {
  return {
    id,
    displayName: id,
    placement: { position: { x: 0, z: 0 }, facing: 0, interactRadius: 3, promptY: 2 },
    createScene: () => ({}) as unknown as StallScene,
    resultRules: GOLDFISH_RESULT_RULES,
  }
}

describe('StallRegistry(屋台の定義+登録 / §2.3)', () => {
  it('register した屋台を id で get できる', () => {
    const r = new StallRegistry()
    const def = fakeDef('a')
    r.register(def)
    expect(r.get('a')).toBe(def)
    expect(r.has('a')).toBe(true)
  })

  it('未登録 id の get は throw / has は false', () => {
    const r = new StallRegistry()
    expect(() => r.get('nope')).toThrow(/未登録/)
    expect(r.has('nope')).toBe(false)
  })

  it('同一 id の二重 register は throw(SceneManager.register と同じ厳格さ)', () => {
    const r = new StallRegistry()
    r.register(fakeDef('a'))
    expect(() => r.register(fakeDef('a'))).toThrow(/登録済み/)
  })

  it('getAll は登録順で全件返す', () => {
    const r = new StallRegistry()
    r.register(fakeDef('a'))
    r.register(fakeDef('b'))
    r.register(fakeDef('c'))
    expect(r.getAll().map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
})
