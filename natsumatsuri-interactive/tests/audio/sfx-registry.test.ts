import { describe, expect, it } from 'vitest'
import { SFX_NAMES, SFX_REGISTRY, resolveSfx } from '../../src/audio/sfx'

/**
 * 効果音レジストリ(sfx:play の name → 合成関数)の写像 unit test(T-008 AC2/AC7)。
 * AUDIO_SPEC §4 のイベント名と実装の 1:1 対応を固定する(契約の取りこぼし/野放しを防ぐ)。
 * AudioContext 非依存の純データ部分なので node 環境で常に実行できる。
 */

// AUDIO_SPEC §4 のイベントマッピング表(name)— 契約。
const SPEC_SFX_NAMES = [
  'prompt',
  'interact',
  'dialogue-next',
  'select',
  'confirm',
  'poi-dip',
  'poi-lift',
  'catch',
  'secure',
  'fish-escape',
  'paper-warning',
  'paper-tear',
  'footstep',
  'result-success',
  'result-fail',
] as const

describe('SFX_REGISTRY ↔ AUDIO_SPEC §4', () => {
  it('AUDIO_SPEC §4 の全イベント名に合成関数がある(過不足なし)', () => {
    expect([...SFX_NAMES].sort()).toEqual([...SPEC_SFX_NAMES].sort())
  })

  it('各 name は関数を引ける(resolveSfx)', () => {
    for (const name of SPEC_SFX_NAMES) {
      expect(typeof resolveSfx(name)).toBe('function')
    }
  })

  it('未知の name は undefined(AudioEngine 側で no-op になる)', () => {
    expect(resolveSfx('does-not-exist')).toBeUndefined()
    expect(resolveSfx('')).toBeUndefined()
  })

  it('レジストリは余計な name を持たない(野放し禁止)', () => {
    for (const name of Object.keys(SFX_REGISTRY)) {
      expect(SPEC_SFX_NAMES).toContain(name)
    }
  })
})
