/**
 * 祭囃子(はやし) — AUDIO_SPEC §3。
 *
 * BPM 92 のループで:
 *  - 笛: 矩形波 + ビブラート(LFO)で五音音階(レ・ミ・ソ・ラ・シ)の 8 小節フレーズを奏でる
 *  - 太鼓: 低周波サイン(60Hz)の減衰で「ドン・ドン・カッ」パターン
 *  - 鉦(かね): 2.8kHz の金属的短音を裏拍で
 *
 * ビートグリッドを LookaheadScheduler で正確に予約し、フレーズは循環インデックスで連続生成するので
 * ループの継ぎ目・位相唸りが目立たない(AUDIO_SPEC §6)。
 *
 * すべて Web Audio API のみ(D-004)。
 */
import { noteHz } from '../synth'
import { LookaheadScheduler } from './scheduler'
import type { AmbientLayer } from './types'

const BPM = 92
const SEC_PER_BEAT = 60 / BPM
const SEC_PER_8TH = SEC_PER_BEAT / 2

// 五音音階(レ・ミ・ソ・ラ・シ)を D5 基準の半音オフセットで。
const RE = noteHz(5) // D5
const MI = noteHz(7) // E5
const SO = noteHz(10) // G5
const LA = noteHz(12) // A5
const SI = noteHz(14) // B5
const RE6 = noteHz(17) // D6

// 8小節 ×(8分=8ステップ)。null は休符。祭囃子らしい上下するフレーズ。
// 0 が小節頭。各小節 8 ステップ。
// prettier-ignore
const FLUTE_PHRASE: (number | null)[] = [
  SO, null, LA, SI, LA, SO, MI, null,   // 1
  SO, LA, SI, null, RE6, SI, LA, SO,    // 2
  MI, null, SO, MI, RE, null, MI, SO,   // 3
  LA, SI, LA, SO, MI, RE, null, null,   // 4
  SO, null, LA, SI, RE6, SI, LA, SO,    // 5
  SI, null, LA, SO, MI, SO, LA, null,   // 6
  RE6, SI, LA, SO, MI, RE, MI, SO,      // 7
  LA, SO, MI, RE, null, RE, null, null, // 8
]

const TOTAL_STEPS = FLUTE_PHRASE.length // 64 ステップ

export function createHayashi(ctx: BaseAudioContext): AmbientLayer {
  const output = ctx.createGain()
  output.gain.value = 1

  // 笛・太鼓・鉦をそれぞれ軽くミックスバランスする。
  const fluteBus = ctx.createGain()
  fluteBus.gain.value = 0.5
  fluteBus.connect(output)
  const taikoBus = ctx.createGain()
  taikoBus.gain.value = 0.85
  taikoBus.connect(output)
  const kaneBus = ctx.createGain()
  kaneBus.gain.value = 0.3
  kaneBus.connect(output)

  let step = 0
  const scheduler = new LookaheadScheduler(ctx, (time) => {
    const s = step % TOTAL_STEPS
    const beatInBar = s % 8

    // --- 笛 ---
    const note = FLUTE_PHRASE[s]
    if (note !== null) {
      emitFlute(ctx, fluteBus, time, note, SEC_PER_8TH * 0.95)
    }

    // --- 太鼓「ドン・ドン・カッ」: 0,2 拍(=ステップ0,4)でドン、6 でカッ ---
    if (beatInBar === 0 || beatInBar === 4) {
      emitTaiko(ctx, taikoBus, time, 'don')
    } else if (beatInBar === 6) {
      emitTaiko(ctx, taikoBus, time, 'ka')
    }

    // --- 鉦: 裏拍(奇数ステップ)で軽く ---
    if (beatInBar % 2 === 1) {
      emitKane(ctx, kaneBus, time)
    }

    step++
    return SEC_PER_8TH
  })

  return {
    output,
    start() {
      scheduler.start()
    },
    dispose() {
      scheduler.stop()
      output.disconnect()
    },
  }
}

/** 笛: 矩形波 + ビブラート。 */
function emitFlute(ctx: BaseAudioContext, dest: AudioNode, when: number, freq: number, dur: number): void {
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, when)

  // ビブラート(6Hz, ±約2%)。
  const vib = ctx.createOscillator()
  vib.type = 'sine'
  vib.frequency.value = 6
  const vibDepth = ctx.createGain()
  vibDepth.gain.value = freq * 0.02
  vib.connect(vibDepth).connect(osc.frequency)

  // 笛らしく高域を少し落とす。
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3500
  lp.Q.value = 0.5

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(0.16, when + 0.02)
  g.gain.setValueAtTime(0.16, when + dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)

  osc.connect(lp).connect(g).connect(dest)
  osc.start(when)
  osc.stop(when + dur + 0.02)
  vib.start(when)
  vib.stop(when + dur + 0.02)
}

/** 太鼓: 低周波サイン減衰。don=深い、ka=やや高く短い。 */
function emitTaiko(ctx: BaseAudioContext, dest: AudioNode, when: number, kind: 'don' | 'ka'): void {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  const startF = kind === 'don' ? 90 : 140
  const endF = kind === 'don' ? 55 : 90
  const dur = kind === 'don' ? 0.22 : 0.12
  osc.frequency.setValueAtTime(startF, when)
  osc.frequency.exponentialRampToValueAtTime(endF, when + dur)

  const g = ctx.createGain()
  const peak = kind === 'don' ? 0.5 : 0.32
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(peak, when + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)

  osc.connect(g).connect(dest)
  osc.start(when)
  osc.stop(when + dur + 0.02)
}

/** 鉦: 2.8kHz の金属的短音(矩形波+高域フィルタで「チン」)。 */
function emitKane(ctx: BaseAudioContext, dest: AudioNode, when: number): void {
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(2800, when)

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2000

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(0.12, when + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.09)

  osc.connect(hp).connect(g).connect(dest)
  osc.start(when)
  osc.stop(when + 0.1)
}
