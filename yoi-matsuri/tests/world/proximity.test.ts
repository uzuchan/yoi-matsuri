import { describe, expect, it } from 'vitest'
import { INTERACT_RADIUS, ProximityTracker } from '../../src/world/proximity'
import { STALL_POSITION } from '../../src/world/stall'

const STALL = { x: STALL_POSITION.x, z: STALL_POSITION.z }

/** 屋台から指定距離だけ -x 方向に離れた位置(参道中心側)。 */
function atDistance(d: number) {
  return { x: STALL.x - d, z: STALL.z }
}

describe('INTERACT_RADIUS(GDD §2)', () => {
  it('3.0m である', () => {
    expect(INTERACT_RADIUS).toBe(3.0)
  })
})

describe('ProximityTracker(enter/leave の単発エッジ判定)', () => {
  it('初期状態は圏外', () => {
    expect(new ProximityTracker().isInside).toBe(false)
  })

  it('圏外→圏内で 1 回だけ enter を返す(滞在中は none)', () => {
    const t = new ProximityTracker()
    expect(t.update(atDistance(10), STALL)).toBe('none') // 圏外滞在
    expect(t.update(atDistance(2), STALL)).toBe('enter') // 進入
    expect(t.update(atDistance(1), STALL)).toBe('none') // 滞在(再発火しない)
    expect(t.update(atDistance(0.5), STALL)).toBe('none') // 滞在(再発火しない)
    expect(t.isInside).toBe(true)
  })

  it('圏内→圏外で 1 回だけ leave を返す(圏外滞在中は none)', () => {
    const t = new ProximityTracker()
    t.update(atDistance(1), STALL) // enter
    expect(t.update(atDistance(5), STALL)).toBe('leave') // 離脱
    expect(t.update(atDistance(8), STALL)).toBe('none') // 圏外滞在(再発火しない)
    expect(t.update(atDistance(20), STALL)).toBe('none')
    expect(t.isInside).toBe(false)
  })

  it('enter / leave を繰り返してもそれぞれ単発', () => {
    const t = new ProximityTracker()
    const edges: string[] = []
    const path = [10, 2, 1, 2, 1, 10, 8, 1, 10] // 圏外→圏内→…→圏外…
    for (const d of path) edges.push(t.update(atDistance(d), STALL))
    expect(edges).toEqual([
      'none', // 10 圏外
      'enter', // 2 進入
      'none', // 1 滞在
      'none', // 2 滞在
      'none', // 1 滞在
      'leave', // 10 離脱
      'none', // 8 圏外滞在
      'enter', // 1 再進入
      'leave', // 10 再離脱
    ])
  })

  it('境界(距離==半径)は圏内に含める(<=)', () => {
    const t = new ProximityTracker(3)
    // ちょうど 3.0m 離れた位置 → 圏内扱いで enter。
    expect(t.update({ x: STALL.x - 3, z: STALL.z }, STALL)).toBe('enter')
  })

  it('境界をわずかに超えると圏外(> radius)', () => {
    const t = new ProximityTracker(3)
    expect(t.update({ x: STALL.x - 3.0001, z: STALL.z }, STALL)).toBe('none')
    expect(t.isInside).toBe(false)
  })

  it('reset で圏外へ戻す(エッジは返さない)', () => {
    const t = new ProximityTracker()
    t.update(atDistance(1), STALL) // enter
    expect(t.isInside).toBe(true)
    t.reset()
    expect(t.isInside).toBe(false)
    // reset 後に圏内へ入れば再び enter が立つ。
    expect(t.update(atDistance(1), STALL)).toBe('enter')
  })

  it('斜め方向でも半径3mで一貫(ユークリッド距離)', () => {
    const t = new ProximityTracker(3)
    // dx=dy=2 → 距離 2.83 < 3 → 圏内。
    expect(t.update({ x: STALL.x - 2, z: STALL.z - 2 }, STALL)).toBe('enter')
    t.reset()
    // dx=dy=2.2 → 距離 3.11 > 3 → 圏外。
    expect(t.update({ x: STALL.x - 2.2, z: STALL.z - 2.2 }, STALL)).toBe('none')
  })
})
