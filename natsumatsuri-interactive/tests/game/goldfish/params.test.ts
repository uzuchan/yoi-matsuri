import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GOLDFISH_PARAMS,
  DEFAULT_TANK_BOUNDS,
  FISH_FLEE_DURATION,
  PAPER_WARNING_THRESHOLD,
} from '../../../src/game/goldfish'

/**
 * AC1: GDD §4.3 物理パラメータ表の全変数を、変数名・初期値・単位どおりに一元定義していることを固定する。
 * ここは「値の正(GDD §4.3)」とコードの一致を機械的に検証するテスト。
 */
describe('params(GDD §4.3 物理パラメータ表)', () => {
  it('全パラメータが GDD §4.3 の初期値どおり', () => {
    expect(DEFAULT_GOLDFISH_PARAMS).toEqual({
      poiFollowLag: 0.12,
      waterDragFactor: 3.5,
      paperDurability: 100,
      wetDamagePerSec: 4.0,
      speedDamageCoeff: 220,
      fishWeightDamage: 12,
      liftSpeedMax: 0.35,
      fishEscapeRadius: 0.18,
      fishCruiseSpeed: 0.1,
      fishFleeSpeed: 0.45,
      sessionTimeLimit: 60,
      fishCount: 8,
      poiRadius: 0.09,
      dipDepth: 0.04,
    })
  })

  it('GDD §4.3 の全 14 変数が欠落なく定義されている', () => {
    const keys = Object.keys(DEFAULT_GOLDFISH_PARAMS).sort()
    expect(keys).toEqual(
      [
        'dipDepth',
        'fishCount',
        'fishCruiseSpeed',
        'fishEscapeRadius',
        'fishFleeSpeed',
        'fishWeightDamage',
        'liftSpeedMax',
        'paperDurability',
        'poiFollowLag',
        'poiRadius',
        'sessionTimeLimit',
        'speedDamageCoeff',
        'waterDragFactor',
        'wetDamagePerSec',
      ].sort(),
    )
  })

  it('補助定数(水槽寸法・逃避持続・警告しきい値)が GDD/AUDIO_SPEC のとおり', () => {
    expect(DEFAULT_TANK_BOUNDS).toEqual({ radiusX: 0.6, radiusZ: 0.45 })
    expect(FISH_FLEE_DURATION).toBe(0.8) // GDD §4.5
    expect(PAPER_WARNING_THRESHOLD).toBe(30) // AUDIO_SPEC §4 paper-warning
  })
})
