/**
 * 花火 — AUDIO_SPEC §3。
 *
 *  - 打ち上げ(launch): 上昇ホイッスル(0.8s)。サインのピッチ上昇 + 薄いノイズの空気感。
 *  - 開花(burst): ノイズバースト(パチパチ)+ 低域ドン(打ち上げから 1.2s 後、視覚と同期)。
 *
 * `fireworks:launch` / `fireworks:burst` イベント駆動だが、これらのイベントは現状 GameEvents に
 * 未定義(花火の視覚は T-009)。本ファイルは合成関数を用意しておき、T-009 で GameEvents に
 * fireworks:* が追加され次第 AudioEngine が購読して鳴らす(AudioEngine.ts のコメント参照)。
 * burst は単発で完結する設計なので、視覚側(T-009)が launch→1.2s→burst のタイミングを発火する。
 *
 * すべて Web Audio API のみ(D-004)。
 */
import { noiseBurst, tone } from '../synth'
import type { SfxSynth } from '../sfx'

/** 打ち上げ: 上昇ホイッスル(0.8s)。 */
export const fireworksLaunch: SfxSynth = (ctx, dest, t) => {
  // ヒューという上昇ホイッスル。
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.8, freq: 400, freqTo: 1700, peak: 0.12, attack: 0.05, release: 0.85 })
  // 打ち上げの空気感(薄い上昇ノイズ)。
  noiseBurst(ctx, dest, { when: t, duration: 0.8, type: 'bandpass', freq: 800, freqTo: 2500, q: 2, peak: 0.06, attack: 0.05, release: 0.85 })
}

/** 開花: ノイズバースト(パチパチ)+ 低域ドン。 */
export const fireworksBurst: SfxSynth = (ctx, dest, t) => {
  // 低域ドン(腹に響く)。
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.35, freq: 110, freqTo: 45, peak: 0.5, attack: 0.004, release: 0.4 })
  // 開花のノイズバースト(広帯域)。
  noiseBurst(ctx, dest, { when: t, duration: 0.5, type: 'lowpass', freq: 4000, freqTo: 800, q: 0.5, peak: 0.4, attack: 0.003, release: 0.55 })
  // パチパチ(高域の散発的な火花)。複数の短い高域ノイズを散らす。
  for (let i = 0; i < 6; i++) {
    const dt = 0.1 + Math.random() * 0.5
    noiseBurst(ctx, dest, { when: t + dt, duration: 0.04, type: 'highpass', freq: 4000, q: 1, peak: 0.12, attack: 0.002, release: 0.05 })
  }
}

/** 花火 sfx 名 → 合成関数(AudioEngine が fireworks:* 購読で引く / T-009 連携)。 */
export const FIREWORKS_SFX: Readonly<Record<'launch' | 'burst', SfxSynth>> = {
  launch: fireworksLaunch,
  burst: fireworksBurst,
}
