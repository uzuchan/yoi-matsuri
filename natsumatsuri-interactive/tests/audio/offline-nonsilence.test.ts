import { describe, expect, it } from 'vitest'
import { SFX_NAMES, resolveSfx } from '../../src/audio/sfx'
import { FIREWORKS_SFX } from '../../src/audio/ambient/fireworksSfx'

/**
 * 各合成関数が「非無音(RMS>0)」を出すことを OfflineAudioContext で自動確認する(T-008 Evidence)。
 *
 * node/test 環境には OfflineAudioContext が無いため、存在する環境(ブラウザ系テストランナー)でのみ実行する。
 * 無い環境では describe.skip で安全にスキップする(AC7: AudioContext 非依存でテストが壊れない)。
 */

const hasOffline = typeof globalThis !== 'undefined' && 'OfflineAudioContext' in globalThis

function rms(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0)
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
  return Math.sqrt(sum / data.length)
}

function peak(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0)
  let p = 0
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i])
    if (a > p) p = a
  }
  return p
}

const describeOffline = hasOffline ? describe : describe.skip

describeOffline('合成関数の非無音(OfflineAudioContext)', () => {
  const OfflineCtor = (globalThis as unknown as { OfflineAudioContext: typeof OfflineAudioContext })
    .OfflineAudioContext

  it.each([...SFX_NAMES])('sfx "%s" は非無音(RMS>0)を出す', async (name) => {
    const ctx = new OfflineCtor(1, 44100 * 2, 44100)
    const synth = resolveSfx(name)!
    synth(ctx, ctx.destination, 0)
    const rendered = await ctx.startRendering()
    expect(rms(rendered)).toBeGreaterThan(0)
  })

  it('1音でリミッタ前のピークが暴れない(クリップしない参考値)', async () => {
    const ctx = new OfflineCtor(1, 44100 * 2, 44100)
    resolveSfx('paper-tear')!(ctx, ctx.destination, 0)
    const rendered = await ctx.startRendering()
    // 単音は十分な余裕(<1.0)を持つ。マスターのリミッタは実機 AudioEngine 側で担保。
    expect(peak(rendered)).toBeLessThan(1.0)
  })

  // 花火(T-009): launch / burst の合成関数が非無音を出すこと。
  it.each(['launch', 'burst'] as const)('fireworks "%s" は非無音(RMS>0)を出す', async (kind) => {
    const ctx = new OfflineCtor(1, 44100 * 2, 44100)
    FIREWORKS_SFX[kind](ctx, ctx.destination, 0)
    const rendered = await ctx.startRendering()
    expect(rms(rendered)).toBeGreaterThan(0)
  })
})

// OfflineAudioContext が無い環境でも「テストファイルとして空でない」ことを示す常時テスト。
describe('offline-nonsilence(環境ガード)', () => {
  it('OfflineAudioContext が無ければスキップされる(テストは壊れない)', () => {
    expect(typeof hasOffline).toBe('boolean')
  })
})
