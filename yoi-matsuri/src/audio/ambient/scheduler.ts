/**
 * Web Audio のルックアヘッド・スケジューラ(環境音レイヤー共用)。
 *
 * setInterval のジッタを音のタイミングに持ち込まないため、一定間隔(25ms)で起き、
 * 「今から lookahead(0.1s)先まで」に入る発音を AudioContext の正確な時刻へ予約する
 * 定番パターン。これにより継ぎ目・位相唸りの目立たない連続ループを作れる(AUDIO_SPEC §6)。
 *
 * テスト/SSR で setInterval が無い環境でも new だけなら安全(start で初めて使う)。
 */
export class LookaheadScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private nextTime = 0
  private readonly intervalMs = 25
  private readonly lookahead = 0.1

  private readonly ctx: BaseAudioContext
  private readonly schedule: (time: number) => number

  /**
   * @param ctx AudioContext(currentTime を読む)
   * @param schedule (time) => 次の発音までの間隔[秒] を返す。time に発音を予約する。
   */
  constructor(ctx: BaseAudioContext, schedule: (time: number) => number) {
    this.ctx = ctx
    this.schedule = schedule
  }

  start(): void {
    if (this.timer !== null) return
    this.nextTime = this.ctx.currentTime + 0.05
    this.timer = setInterval(() => this.tick(), this.intervalMs)
  }

  private tick(): void {
    const horizon = this.ctx.currentTime + this.lookahead
    // 暴走防止(タブ復帰などで大量に溜まった場合は最大16発で打ち切る)。
    let guard = 0
    while (this.nextTime < horizon && guard < 16) {
      const interval = this.schedule(this.nextTime)
      this.nextTime += Math.max(0.01, interval)
      guard++
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
