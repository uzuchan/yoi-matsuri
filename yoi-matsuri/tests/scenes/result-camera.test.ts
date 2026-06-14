import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { computeResultCamera, computeResultCameraGeometry } from '../../src/scenes/stall'
import type { StallPlacement } from '../../src/scenes/stall'

/**
 * 結果カメラの placement 一般化テスト(StallFramework §5.3 / §10 Risk 2)。
 * 金魚 placement での出力が現行 ResultScene の固定数値(T-009 構図)と完全一致することを固定し、
 * 構図デグレを防ぐ。
 */

// 金魚すくいの placement(world/stall.ts: 中腹右 x=5,z=-26 / 開口は -x 向き facing=-π/2)。
const GOLDFISH_PLACEMENT: StallPlacement = {
  position: { x: 5, z: -26 },
  facing: -Math.PI / 2,
  interactRadius: 3,
  promptY: 2,
}

describe('computeResultCamera(金魚 placement の現行構図再現 / §5.3)', () => {
  it('幾何が現行 ResultScene の固定数値と一致する(回帰0)', () => {
    const g = computeResultCameraGeometry(GOLDFISH_PLACEMENT)
    // 現行: position=(STALL.x-4.5, 1.8, KEEPER_Z+1.8)=(0.5,1.8,-23.9) / look=(KEEPER_X,1.5,KEEPER_Z+1.8)。
    expect(g.fov).toBe(50)
    expect(g.position.x).toBeCloseTo(0.5, 5)
    expect(g.position.y).toBeCloseTo(1.8, 5)
    expect(g.position.z).toBeCloseTo(-23.9, 5)
    expect(g.lookAt.x).toBeCloseTo(4.5, 5)
    expect(g.lookAt.y).toBeCloseTo(1.5, 5)
    expect(g.lookAt.z).toBeCloseTo(-23.9, 5)
  })

  it('PerspectiveCamera を組み、店主頭部が画面内かつ中央パネル左外(x<340px / 1280幅)に来る', () => {
    const cam = computeResultCamera(GOLDFISH_PLACEMENT)
    cam.aspect = 1280 / 720
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)

    // 店主頭部 world ≈ (4.5,1.66,-25.7)。
    const headNdc = new Vector3(4.5, 1.66, -25.7).project(cam)
    const headPx = (headNdc.x * 0.5 + 0.5) * 1280
    expect(headNdc.x).toBeGreaterThan(-1)
    expect(headNdc.x).toBeLessThan(1)
    expect(headPx).toBeLessThan(340)

    // §7-4 維持: 裸電球2個が引き続き画面内に残る。
    for (const bulb of [new Vector3(5, 2.1, -26.9), new Vector3(5, 2.1, -25.1)]) {
      const b = bulb.project(cam)
      expect(b.x).toBeGreaterThan(-1)
      expect(b.x).toBeLessThan(1)
    }
  })
})
