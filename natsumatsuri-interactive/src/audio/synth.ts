/**
 * プロシージャル合成の共通ユーティリティ(src/audio 内専用)。
 *
 * すべての合成関数は `BaseAudioContext`(AudioContext / OfflineAudioContext のどちらでも可)を
 * 受け取り、与えられた `destination` ノードへ接続する。これにより:
 *  - 実行時は AudioEngine が生成した AudioContext のカテゴリ Gain へ繋ぐ
 *  - テスト時は OfflineAudioContext で各音の非無音(RMS>0)を検証できる(D-004 / AUDIO_SPEC §6)
 *
 * すべて three / react / DOM 非依存(Web Audio API のみ)。
 */

/** 音名の基準周波数(A4 = 440Hz)から半音オフセットで周波数を作るヘルパ。 */
export function noteHz(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12)
}

/**
 * ノイズ音源(AudioBuffer)を生成する。白色/ブラウンを選択可能。
 * 効果音の都度生成では短いバッファ、環境音では長いループバッファに使う。
 */
export function makeNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
  kind: 'white' | 'brown' = 'white',
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  if (kind === 'white') {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  } else {
    // ブラウンノイズ: ランダムウォークを積分して低域寄りにする(群衆のざわめき向け)。
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5 // 正規化(おおよそ -1..1)
    }
  }
  return buffer
}

/** 短い効果音用のノイズバースト発生器(都度ノード生成・自動破棄)を作る。 */
export function makeNoiseSource(ctx: BaseAudioContext, durationSec: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = makeNoiseBuffer(ctx, durationSec, 'white')
  return src
}

/**
 * Gain による短いエンベロープ(attack→decay)を当てる。
 * `peak` をピーク音量、`attack`/`release` を秒で指定。`when` は開始時刻(ctx.currentTime 基準)。
 */
export function envGain(
  ctx: BaseAudioContext,
  when: number,
  peak: number,
  attack: number,
  release: number,
): GainNode {
  const g = ctx.createGain()
  const t0 = when
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release)
  return g
}

/**
 * 単純なオシレータ1音を合成して destination へ流す(効果音の構成要素)。
 * 周波数の線形/指数スイープにも対応(from→to)。終了後にノードを停止する。
 */
export function tone(
  ctx: BaseAudioContext,
  destination: AudioNode,
  opts: {
    type: OscillatorType
    when: number
    duration: number
    freq: number
    freqTo?: number
    peak: number
    attack?: number
    release?: number
  },
): void {
  const { type, when, duration, freq, freqTo, peak } = opts
  const attack = opts.attack ?? 0.005
  const release = opts.release ?? duration
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)
  if (freqTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), when + duration)
  }
  const g = envGain(ctx, when, peak, attack, release)
  osc.connect(g).connect(destination)
  osc.start(when)
  osc.stop(when + attack + release + 0.02)
}

/**
 * 帯域通過させたノイズバーストを destination へ流す(水音・砂利・紙裂け等の素材)。
 * `type` で bandpass/highpass/lowpass を選び、`freq`/`q` でフィルタ特性を決める。
 */
export function noiseBurst(
  ctx: BaseAudioContext,
  destination: AudioNode,
  opts: {
    when: number
    duration: number
    type: BiquadFilterType
    freq: number
    freqTo?: number
    q?: number
    peak: number
    attack?: number
    release?: number
  },
): void {
  const { when, duration, type, freq, freqTo, peak } = opts
  const attack = opts.attack ?? 0.004
  const release = opts.release ?? duration
  const src = makeNoiseSource(ctx, attack + release + 0.05)
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, when)
  if (freqTo !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), when + duration)
  }
  filter.Q.value = opts.q ?? 1
  const g = envGain(ctx, when, peak, attack, release)
  src.connect(filter).connect(g).connect(destination)
  src.start(when)
  src.stop(when + attack + release + 0.05)
}

/** clamp ヘルパ。 */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
