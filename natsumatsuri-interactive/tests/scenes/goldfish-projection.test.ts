import { describe, expect, it } from 'vitest'
import { DEFAULT_TANK_BOUNDS } from '../../src/game/goldfish'
import {
  clampToPlayArea,
  isOverBowl,
  keyboardTarget,
  type PlayArea,
} from '../../src/scenes/goldfish/projection'

/**
 * 金魚すくいの入力組み立て(純TS)の unit test(T-006 AC5 / Risk(1))。
 * カーソル→水面投影の矩形クランプ(水槽+お椀)、キーボード移動、お椀ヒット判定を固定する。
 */

const B = DEFAULT_TANK_BOUNDS // rx0.6 / rz0.45

// 可動範囲(水槽 + お椀を含む矩形)。シーンの playArea と同形。
const AREA: PlayArea = {
  minX: -B.radiusX,
  maxX: B.radiusX + 0.24 + 0.16, // bowlX + bowlRadius
  minZ: -B.radiusZ,
  maxZ: B.radiusZ,
}

describe('clampToPlayArea', () => {
  it('範囲内の点はそのまま', () => {
    const p = clampToPlayArea({ x: 0.2, z: -0.1 }, AREA)
    expect(p.x).toBeCloseTo(0.2, 10)
    expect(p.z).toBeCloseTo(-0.1, 10)
  })
  it('お椀側(+x の範囲内)へは出られる(楕円クランプと違い矩形)', () => {
    const p = clampToPlayArea({ x: 0.8, z: 0 }, AREA) // 水槽楕円の外だが矩形内
    expect(p.x).toBeCloseTo(0.8, 10)
  })
  it('右端を超えたら maxX へクランプ', () => {
    const p = clampToPlayArea({ x: 5, z: 0 }, AREA)
    expect(p.x).toBeCloseTo(AREA.maxX, 10)
  })
  it('上下(z)も矩形でクランプ', () => {
    expect(clampToPlayArea({ x: 0, z: 5 }, AREA).z).toBeCloseTo(AREA.maxZ, 10)
    expect(clampToPlayArea({ x: 0, z: -5 }, AREA).z).toBeCloseTo(AREA.minZ, 10)
  })
})

describe('keyboardTarget', () => {
  it('入力なしなら現在位置を保つ', () => {
    const p = keyboardTarget({ x: 0.1, z: -0.1 }, { up: false, down: false, left: false, right: false }, 0.016, 0.5, AREA)
    expect(p.x).toBeCloseTo(0.1, 10)
    expect(p.z).toBeCloseTo(-0.1, 10)
  })

  it('right で +x へ speed×dt だけ動く', () => {
    const p = keyboardTarget({ x: 0, z: 0 }, { up: false, down: false, left: false, right: true }, 0.1, 0.5, AREA)
    expect(p.x).toBeCloseTo(0.05, 6) // 0.5 m/s × 0.1 s
    expect(p.z).toBeCloseTo(0, 6)
  })

  it('up は画面奥(-z)へ、down は手前(+z)へ', () => {
    const up = keyboardTarget({ x: 0, z: 0 }, { up: true, down: false, left: false, right: false }, 0.1, 0.5, AREA)
    expect(up.z).toBeLessThan(0)
    const down = keyboardTarget({ x: 0, z: 0 }, { up: false, down: true, left: false, right: false }, 0.1, 0.5, AREA)
    expect(down.z).toBeGreaterThan(0)
  })

  it('斜め(right+up)でも合計速度が speed を超えない(正規化)', () => {
    const p = keyboardTarget({ x: 0, z: 0 }, { up: true, down: false, left: false, right: true }, 0.1, 0.5, AREA)
    const dist = Math.hypot(p.x - 0, p.z - 0)
    expect(dist).toBeCloseTo(0.05, 6) // 対角でも 0.5×0.1
  })

  it('右へ動かし続けるとお椀(可動範囲の +x 端)へ到達できる', () => {
    let p = { x: 0, z: 0 }
    for (let i = 0; i < 200; i++) {
      p = keyboardTarget(p, { up: false, down: false, left: false, right: true }, 1 / 60, 0.5, AREA)
    }
    expect(p.x).toBeCloseTo(AREA.maxX, 6) // お椀まで運べる(secure 可能)
  })

  it('結果は可動範囲(矩形)内へクランプされる(範囲外へ出ない)', () => {
    const p = keyboardTarget({ x: AREA.maxX - 0.01, z: 0 }, { up: false, down: false, left: false, right: true }, 1, 1, AREA)
    expect(p.x).toBeLessThanOrEqual(AREA.maxX + 1e-6)
  })
})

describe('isOverBowl', () => {
  const bowl = { x: 0.94, z: 0 } // 水槽外(rx0.6 + 0.34)
  const radius = 0.16

  it('お椀の中心はヒット', () => {
    expect(isOverBowl({ x: 0.94, z: 0 }, bowl, radius)).toBe(true)
  })

  it('お椀の縁ぎりぎり内はヒット', () => {
    expect(isOverBowl({ x: 0.94 + 0.15, z: 0 }, bowl, radius)).toBe(true)
  })

  it('お椀の外はミス', () => {
    expect(isOverBowl({ x: 0.94 + 0.2, z: 0 }, bowl, radius)).toBe(false)
  })

  it('水槽中心(0,0)はお椀の外', () => {
    expect(isOverBowl({ x: 0, z: 0 }, bowl, radius)).toBe(false)
  })
})
