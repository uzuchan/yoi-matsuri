/**
 * 群衆のざわめき — AUDIO_SPEC §3。
 *
 * ブラウンノイズ → バンドパス(300-800Hz)+ ゆらぎ LFO で「人混みのざわ…」というベッドを作り、
 * その上に時々ピッチの異なる短い「声」風バースト(フォルマント的なフィルタ済みノイズ)を確率的に重ねる。
 * ノイズ源はループ再生し継ぎ目を作らない(AUDIO_SPEC §6)。
 *
 * すべて Web Audio API のみ(D-004)。
 */
import { makeNoiseBuffer } from '../synth'
import { LookaheadScheduler } from './scheduler'
import type { AmbientLayer } from './types'

export function createCrowd(ctx: BaseAudioContext): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 1

  // --- ベッド: ループするブラウンノイズ → バンドパス ---
  const noise = ctx.createBufferSource()
  noise.buffer = makeNoiseBuffer(ctx, 4, 'brown') // 4s ループ(十分長く継ぎ目が目立たない)
  noise.loop = true

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 500
  bp.Q.value = 0.7

  const bedGain = ctx.createGain()
  bedGain.gain.value = 0.5

  // ゆらぎ LFO(0.15Hz)で帯域中心を 300-800Hz の間で漂わせ、ざわめきの「波」を作る。
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.15
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 250 // ±250Hz(500±250 = 250..750)
  lfo.connect(lfoDepth).connect(bp.frequency)

  // ゆらぎ LFO(0.23Hz)で全体音量も軽く脈動させる(人混みの抑揚)。
  const ampLfo = ctx.createOscillator()
  ampLfo.type = 'sine'
  ampLfo.frequency.value = 0.23
  const ampLfoDepth = ctx.createGain()
  ampLfoDepth.gain.value = 0.12
  ampLfo.connect(ampLfoDepth).connect(bedGain.gain)

  noise.connect(bp).connect(bedGain).connect(output)

  // --- 「声」風バースト: フォルマント帯のフィルタ済みノイズを確率的に ---
  const voiceScheduler = new LookaheadScheduler(ctx, (time) => {
    emitVoiceBlip(ctx, output, time)
    return 0.7 + Math.random() * 1.6 // 0.7〜2.3s間隔
  })

  let started = false

  return {
    output,
    start() {
      if (started) return
      started = true
      const now = ctx.currentTime
      noise.start(now)
      lfo.start(now)
      ampLfo.start(now)
      voiceScheduler.start()
    },
    dispose() {
      voiceScheduler.stop()
      try {
        if (started) {
          noise.stop()
          lfo.stop()
          ampLfo.stop()
        }
      } catch {
        // 既に停止済みは無視。
      }
      output.disconnect()
    },
  }
}

/** 遠くの「声」風の短いバースト(フォルマント帯のフィルタ済みノイズ)。 */
function emitVoiceBlip(ctx: BaseAudioContext, dest: AudioNode, when: number): void {
  const dur = 0.18 + Math.random() * 0.22
  const src = ctx.createBufferSource()
  src.buffer = makeNoiseBuffer(ctx, dur + 0.1, 'white')

  // フォルマント風に 2 つのバンドパスを直列にし、母音っぽい色を付ける。
  const f1 = ctx.createBiquadFilter()
  f1.type = 'bandpass'
  f1.frequency.value = 500 + Math.random() * 500 // 500-1000Hz
  f1.Q.value = 5
  const f2 = ctx.createBiquadFilter()
  f2.type = 'bandpass'
  f2.frequency.value = 1200 + Math.random() * 800 // 1200-2000Hz
  f2.Q.value = 6

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, when + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)

  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (panner) {
    panner.pan.value = (Math.random() * 2 - 1) * 0.7
    src.connect(f1).connect(f2).connect(g).connect(panner).connect(dest)
  } else {
    src.connect(f1).connect(f2).connect(g).connect(dest)
  }
  src.start(when)
  src.stop(when + dur + 0.1)
}
