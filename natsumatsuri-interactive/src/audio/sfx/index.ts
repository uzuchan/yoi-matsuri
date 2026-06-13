/**
 * 効果音(AUDIO_SPEC §4 イベントマッピング表)のプロシージャル合成関数群。
 *
 * 各関数は `(ctx, destination, when)` を受け、再生のたびにノードを都度生成して
 * destination(= AudioEngine の sfx カテゴリ Gain)へ繋ぐ。状態を持たないため
 * 同時多重発火しても干渉しない(発音→自動停止)。
 *
 * 合成方法は AUDIO_SPEC §4 の「合成方法(目安)」に忠実:
 *  prompt/interact/dialogue-next/select/confirm/poi-dip/poi-lift/
 *  catch/secure/fish-escape/paper-warning/paper-tear/footstep/result-success/result-fail
 *
 * すべて Web Audio API のみ(D-004)。OfflineAudioContext でも動作する(非無音テスト用)。
 */
import { noiseBurst, noteHz, tone } from '../synth'

/** 1 件の効果音合成関数の型。`when` は ctx.currentTime 基準の発音開始時刻。 */
export type SfxSynth = (ctx: BaseAudioContext, destination: AudioNode, when: number) => void

// --- 個別合成関数(AUDIO_SPEC §4) ---

/** prompt: 近接プロンプト表示。柔らかいサイン2音(C6→E6, 80ms)。 */
function prompt(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.08, freq: noteHz(15), peak: 0.18, release: 0.09 }) // C6
  tone(ctx, dest, { type: 'sine', when: t + 0.06, duration: 0.08, freq: noteHz(19), peak: 0.18, release: 0.1 }) // E6
}

/** interact: 屋台インタラクト。木質クリック(ノイズ+BP 1kHz, 50ms)。 */
function interact(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, { when: t, duration: 0.05, type: 'bandpass', freq: 1000, q: 3, peak: 0.5, attack: 0.002, release: 0.05 })
  // 木の芯となる低めの短いトーンを薄く重ねる(質感)。
  tone(ctx, dest, { type: 'triangle', when: t, duration: 0.05, freq: 220, peak: 0.12, release: 0.05 })
}

/** dialogue-next: セリフ送り。短いポップ(三角波 660Hz, 40ms)。 */
function dialogueNext(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'triangle', when: t, duration: 0.04, freq: 660, peak: 0.22, attack: 0.003, release: 0.045 })
}

/** select: 選択肢フォーカス。サイン 880Hz, 30ms。 */
function select(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.03, freq: 880, peak: 0.16, attack: 0.002, release: 0.04 })
}

/** confirm: 選択確定/ボタン。2音上昇(660→990Hz, 90ms)。 */
function confirm(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.05, freq: 660, peak: 0.24, release: 0.06 })
  tone(ctx, dest, { type: 'sine', when: t + 0.05, duration: 0.06, freq: 990, peak: 0.24, release: 0.08 })
}

/** poi-dip: ポイ着水。水音(ノイズ+LP 600Hz+ピッチ下降, 150ms)。 */
function poiDip(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, { when: t, duration: 0.15, type: 'lowpass', freq: 900, freqTo: 350, q: 1, peak: 0.4, attack: 0.005, release: 0.16 })
  // こもった「ぷくっ」とした低域(着水の量感)。
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.12, freq: 320, freqTo: 180, peak: 0.18, release: 0.13 })
}

/** poi-lift: ポイ持ち上げ。水滴(サイン1.2kHz→0.4kHz, 120ms)+滴り。 */
function poiLift(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.12, freq: 1200, freqTo: 400, peak: 0.22, attack: 0.003, release: 0.13 })
  // 滴り(遅延した短い高域の点)。
  tone(ctx, dest, { type: 'sine', when: t + 0.13, duration: 0.05, freq: 1500, freqTo: 900, peak: 0.12, release: 0.06 })
}

/** catch: 捕獲成功。明るい3音(C5-E5-G5, 200ms)。 */
function catchFish(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'triangle', when: t, duration: 0.07, freq: noteHz(3), peak: 0.24, release: 0.08 }) // C5
  tone(ctx, dest, { type: 'triangle', when: t + 0.07, duration: 0.07, freq: noteHz(7), peak: 0.24, release: 0.08 }) // E5
  tone(ctx, dest, { type: 'triangle', when: t + 0.14, duration: 0.08, freq: noteHz(10), peak: 0.26, release: 0.12 }) // G5
}

/** secure: お椀へ確保。catch + 低域タップ。 */
function secure(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  catchFish(ctx, dest, t)
  // お椀に収まる低域タップ。
  tone(ctx, dest, { type: 'sine', when: t + 0.18, duration: 0.1, freq: 140, freqTo: 90, peak: 0.3, attack: 0.004, release: 0.12 })
}

/** fish-escape: 金魚こぼれ/逃げ。水はね(ノイズバースト 100ms)+下降2音。 */
function fishEscape(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, { when: t, duration: 0.1, type: 'bandpass', freq: 1600, freqTo: 700, q: 0.8, peak: 0.34, attack: 0.003, release: 0.11 })
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.08, freq: 700, peak: 0.16, release: 0.1 })
  tone(ctx, dest, { type: 'sine', when: t + 0.07, duration: 0.1, freq: 480, freqTo: 300, peak: 0.16, release: 0.12 })
}

/** paper-warning: 耐久30以下(初回)。低い注意音(サイン 220Hz×2, 控えめ)。 */
function paperWarning(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.12, freq: 220, peak: 0.18, release: 0.13 })
  tone(ctx, dest, { type: 'sine', when: t + 0.16, duration: 0.12, freq: 220, peak: 0.18, release: 0.13 })
}

/** paper-tear: ポイ破損。ノイズバースト(HP 2kHz, 250ms)=紙が裂ける音。 */
function paperTear(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, { when: t, duration: 0.25, type: 'highpass', freq: 2000, freqTo: 3500, q: 0.7, peak: 0.42, attack: 0.004, release: 0.26 })
  // 裂ける引っ掛かり感の薄い中域。
  noiseBurst(ctx, dest, { when: t + 0.02, duration: 0.18, type: 'bandpass', freq: 3000, q: 1.5, peak: 0.2, attack: 0.004, release: 0.2 })
}

/** footstep: 歩行。砂利(ノイズバースト+BP 2kHz, 60ms, 音量小)。 */
function footstep(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, { when: t, duration: 0.06, type: 'bandpass', freq: 2000, q: 1.2, peak: 0.18, attack: 0.002, release: 0.06 })
  // 砂利を踏む低域の質量。
  tone(ctx, dest, { type: 'sine', when: t, duration: 0.05, freq: 120, peak: 0.08, release: 0.05 })
}

/** result-success: 結果(成功/大成功)。祭囃子モチーフの短いジングル(1.5s)。 */
function resultSuccess(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  // 五音音階(レ・ミ・ソ・ラ・シ)の上昇モチーフを矩形波の笛で(祭囃子と統一感)。
  const melody = [noteHz(5), noteHz(7), noteHz(10), noteHz(12), noteHz(14), noteHz(17)] // D5 E5 G5 A5 B5 D6
  const step = 0.16
  melody.forEach((f, i) => {
    tone(ctx, dest, { type: 'square', when: t + i * step, duration: step, freq: f, peak: 0.14, attack: 0.006, release: step + 0.05 })
  })
  // 締めの太鼓ドン。
  tone(ctx, dest, { type: 'sine', when: t + melody.length * step, duration: 0.3, freq: 70, peak: 0.4, attack: 0.005, release: 0.32 })
  // 鉦のきらめき(金属的短音)。
  tone(ctx, dest, { type: 'square', when: t + melody.length * step, duration: 0.08, freq: 2800, peak: 0.08, release: 0.18 })
}

/** result-fail: 結果(失敗)。下降3音+優しい鈴(残念だが温かい)。 */
function resultFail(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'triangle', when: t, duration: 0.25, freq: noteHz(7), peak: 0.2, release: 0.3 }) // E5
  tone(ctx, dest, { type: 'triangle', when: t + 0.22, duration: 0.25, freq: noteHz(3), peak: 0.2, release: 0.3 }) // C5
  tone(ctx, dest, { type: 'triangle', when: t + 0.44, duration: 0.4, freq: noteHz(-2), peak: 0.2, release: 0.5 }) // A4
  // 優しい鈴(高域のサイン+わずかな倍音)で温かさを残す。
  tone(ctx, dest, { type: 'sine', when: t + 0.5, duration: 0.5, freq: 2100, peak: 0.07, attack: 0.01, release: 0.7 })
  tone(ctx, dest, { type: 'sine', when: t + 0.5, duration: 0.5, freq: 3150, peak: 0.04, attack: 0.01, release: 0.7 })
}

/**
 * 効果音名 → 合成関数のディスパッチ表(AUDIO_SPEC §4 の name と 1:1)。
 * AudioEngine が `sfx:play` の name でここを引く。純データ(副作用なし)なので unit test で写像を固定できる。
 */
export const SFX_REGISTRY: Readonly<Record<string, SfxSynth>> = {
  prompt,
  interact,
  'dialogue-next': dialogueNext,
  select,
  confirm,
  'poi-dip': poiDip,
  'poi-lift': poiLift,
  catch: catchFish,
  secure,
  'fish-escape': fishEscape,
  'paper-warning': paperWarning,
  'paper-tear': paperTear,
  footstep,
  'result-success': resultSuccess,
  'result-fail': resultFail,
}

/** AUDIO_SPEC §4 の全効果音名(契約)。テストとドキュメント整合チェックに使う。 */
export const SFX_NAMES: readonly string[] = Object.keys(SFX_REGISTRY)

/** 名前から合成関数を引く。未知の name は undefined(AudioEngine 側で no-op)。 */
export function resolveSfx(name: string): SfxSynth | undefined {
  return SFX_REGISTRY[name]
}
