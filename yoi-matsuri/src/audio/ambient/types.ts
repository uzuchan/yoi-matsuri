/**
 * 環境音レイヤーの共通インターフェース(src/audio/ambient 内専用)。
 *
 * 各レイヤー(crickets / crowd / hayashi)は connect 済みの出力ノード(`output`)を持ち、
 * AudioEngine がそれをカテゴリ Gain(ambient / music)へ繋ぐ。`start()` で発音を開始し、
 * 自前のスケジューラ(setInterval ではなく Web Audio のルックアヘッド or 連続合成)で
 * 継ぎ目・位相唸りの目立たないループを生成する(AUDIO_SPEC §6)。`dispose()` で停止・解放する。
 */
export interface AmbientLayer {
  /** カテゴリ Gain へ繋ぐ出力ノード(レイヤー内のミックス済み)。 */
  readonly output: AudioNode
  /** 発音を開始する(初回 resume 後に AudioEngine が呼ぶ)。 */
  start(): void
  /** 停止してノードを解放する。 */
  dispose(): void
}
