/**
 * 虫の声(スズムシ) — AUDIO_SPEC §3。
 *
 * 4.2kHz 帯のサイン波を約18Hz の AM 変調で「リーン…リーン…」と鳴らし、0.3s の短いバーストを
 * 確率的に発音する。2〜3声を左右にパンして配置し、声ごとに微妙にピッチ/間隔をずらして
 * 機械的反復を避ける(継ぎ目・位相唸りが目立たない / AUDIO_SPEC §6)。
 *
 * すべて Web Audio API のみ(D-004)。
 */
import { envGain } from '../synth'
import { LookaheadScheduler } from './scheduler'
import type { AmbientLayer } from './types'

interface Voice {
  baseFreq: number
  amHz: number
  pan: number
  minGap: number
  gapJitter: number
}

const VOICES: Voice[] = [
  { baseFreq: 4200, amHz: 18, pan: -0.6, minGap: 0.9, gapJitter: 0.7 },
  { baseFreq: 4350, amHz: 17, pan: 0.55, minGap: 1.1, gapJitter: 0.8 },
  { baseFreq: 4080, amHz: 19, pan: 0.05, minGap: 1.4, gapJitter: 1.0 },
]

export function createCrickets(ctx: BaseAudioContext): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 1

  const schedulers: LookaheadScheduler[] = []

  for (const voice of VOICES) {
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    const dest: AudioNode = panner ?? output
    if (panner) {
      panner.pan.value = voice.pan
      panner.connect(output)
    }

    const scheduler = new LookaheadScheduler(ctx, (time) => {
      emitChirp(ctx, dest, time, voice)
      // 確率的な間隔(最小ギャップ + ゆらぎ)。声ごとに違う周期で位相唸りを避ける。
      return voice.minGap + Math.random() * voice.gapJitter
    })
    schedulers.push(scheduler)
  }

  return {
    output,
    start() {
      for (const s of schedulers) s.start()
    },
    dispose() {
      for (const s of schedulers) s.stop()
      output.disconnect()
    },
  }
}

/** スズムシの1バースト(0.3s, AM変調されたサイン)。 */
function emitChirp(ctx: BaseAudioContext, dest: AudioNode, when: number, voice: Voice): void {
  const dur = 0.3
  // キャリア(サイン)。
  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.setValueAtTime(voice.baseFreq * (0.99 + Math.random() * 0.02), when)

  // AM 変調(約18Hz)を Gain の rapid な揺れで作る。
  const amGain = ctx.createGain()
  amGain.gain.value = 0
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(voice.amHz, when)
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.5
  // LFO(-1..1) → depth*0.5 → amGain.gain にオフセット 0.5 を足して 0..1 の脈動にする。
  const bias = ctx.createConstantSource ? ctx.createConstantSource() : null
  if (bias) {
    bias.offset.value = 0.5
    bias.connect(amGain.gain)
    bias.start(when)
    bias.stop(when + dur + 0.05)
  }
  lfo.connect(lfoDepth).connect(amGain.gain)

  // 全体エンベロープ(短いバースト)。
  const env = envGain(ctx, when, 0.09, 0.03, dur)

  carrier.connect(amGain).connect(env).connect(dest)
  carrier.start(when)
  carrier.stop(when + dur + 0.05)
  lfo.start(when)
  lfo.stop(when + dur + 0.05)
}
