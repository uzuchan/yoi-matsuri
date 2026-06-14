import { describe, expect, it } from 'vitest'
import { createStallRegistry } from '../../src/scenes/stall/definitions'
import { computeFestivalStallPlacements } from '../../src/world'

/**
 * P2 量産実証の配線テスト: 「定義+登録」だけで屋台が増えていること、及び placement が装飾屋台
 * (festivalStalls)の「スーパーボール」「お面」位置に一致すること(二重構造にならない = 同座標へ遊技を載せる)。
 */

describe('P2 屋台の登録(量産実証: 定義+1行で増える)', () => {
  it('金魚 + スーパーボール + お面 の 3 軒が登録される', () => {
    const registry = createStallRegistry()
    const ids = registry.getAll().map((d) => d.id)
    expect(ids).toContain('goldfish-stall')
    expect(ids).toContain('superball-stall')
    expect(ids).toContain('mask-stall')
    expect(ids.length).toBe(3)
  })

  it('各屋台が StallDefinition の契約を満たす(createScene/createDialogue/resultRules/placement)', () => {
    const registry = createStallRegistry()
    for (const id of ['superball-stall', 'mask-stall']) {
      const def = registry.get(id)
      expect(typeof def.createScene).toBe('function')
      expect(typeof def.createDialogue).toBe('function')
      expect(def.resultRules.thresholds.success).toBeGreaterThan(0)
      expect(def.placement.interactRadius).toBeGreaterThan(0)
      // 固有会話が生成できる(状態機械は金魚と共通・スクリプト差し替え)。
      const ctrl = def.createDialogue!()
      ctrl.start()
      expect(ctrl.view().active).toBe(true)
    }
  })

  it('placement が装飾屋台の「スーパーボール」「お面」位置に一致する(二重構造回避)', () => {
    const registry = createStallRegistry()
    const placements = computeFestivalStallPlacements()
    // festivalStalls の STALL_KINDS index: お面=7 / スーパーボール=13。
    const superballDeco = placements.find((p) => p.kind === 13)!
    const maskDeco = placements.find((p) => p.kind === 7)!

    const superball = registry.get('superball-stall').placement
    expect(superball.position.x).toBeCloseTo(superballDeco.x, 5)
    expect(superball.position.z).toBeCloseTo(superballDeco.z, 5)
    expect(superball.facing).toBeCloseTo(superballDeco.rotationY, 5)

    const mask = registry.get('mask-stall').placement
    expect(mask.position.x).toBeCloseTo(maskDeco.x, 5)
    expect(mask.position.z).toBeCloseTo(maskDeco.z, 5)
    expect(mask.facing).toBeCloseTo(maskDeco.rotationY, 5)
  })
})
