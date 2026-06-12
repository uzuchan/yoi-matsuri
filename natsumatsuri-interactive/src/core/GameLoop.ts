export interface GameLoopOptions {
  /** 固定タイムステップの更新周波数(Hz)。既定60。 */
  updateHz?: number
  /**
   * 1フレームで消化する経過時間の上限(ms)。既定250。
   * タブ復帰やGCスパイクで巨大なdeltaが来ても、updateの暴走(spiral of death)を防ぐ。
   */
  maxFrameDelta?: number
  /** フレームスケジューラ。既定はrequestAnimationFrame。テストでは手動ドライバを注入する。 */
  requestFrame?: (callback: (timeMs: number) => void) => number
  cancelFrame?: (handle: number) => void
}

function defaultRequestFrame(callback: (timeMs: number) => void): number {
  return requestAnimationFrame(callback)
}

function defaultCancelFrame(handle: number): void {
  cancelAnimationFrame(handle)
}

/**
 * 固定タイムステップ(update 60Hz)+ 可変描画(rAF)のゲームループ(TECHNICAL_ARCHITECTURE §3)。
 * - onUpdate のdtは常に 1/updateHz 秒で固定
 * - onRender のalphaは次updateまでの補間係数 [0, 1)
 * - fps は直近1秒間の実測描画フレームレート
 */
export class GameLoop {
  private readonly stepMs: number
  private readonly fixedDt: number
  private readonly maxFrameDelta: number
  private readonly requestFrame: (callback: (timeMs: number) => void) => number
  private readonly cancelFrame: (handle: number) => void

  private readonly updateCallbacks: Array<(dt: number) => void> = []
  private readonly renderCallbacks: Array<(alpha: number) => void> = []

  private running = false
  private frameHandle = 0
  private lastTime: number | null = null
  private accumulator = 0

  private fpsValue = 0
  private frameCount = 0
  private fpsWindowStart: number | null = null

  constructor(options: GameLoopOptions = {}) {
    const updateHz = options.updateHz ?? 60
    this.stepMs = 1000 / updateHz
    this.fixedDt = 1 / updateHz
    this.maxFrameDelta = options.maxFrameDelta ?? 250
    this.requestFrame = options.requestFrame ?? defaultRequestFrame
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame
  }

  /** 直近1秒間の実測FPS。計測窓が満ちるまでは0。 */
  get fps(): number {
    return this.fpsValue
  }

  onUpdate(callback: (dt: number) => void): void {
    this.updateCallbacks.push(callback)
  }

  onRender(callback: (alpha: number) => void): void {
    this.renderCallbacks.push(callback)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = null
    this.accumulator = 0
    this.fpsValue = 0
    this.frameCount = 0
    this.fpsWindowStart = null
    this.frameHandle = this.requestFrame(this.frame)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.cancelFrame(this.frameHandle)
  }

  private readonly frame = (timeMs: number): void => {
    if (!this.running) return

    if (this.lastTime === null) {
      // 初回フレームは基準時刻の記録のみ(deltaが定義できない)
      this.lastTime = timeMs
      this.fpsWindowStart = timeMs
    } else {
      let delta = timeMs - this.lastTime
      this.lastTime = timeMs
      if (delta > this.maxFrameDelta) {
        delta = this.maxFrameDelta // スパイク時の累積上限クランプ
      }
      if (delta > 0) {
        this.accumulator += delta
      }
      while (this.accumulator >= this.stepMs) {
        for (const callback of this.updateCallbacks) callback(this.fixedDt)
        this.accumulator -= this.stepMs
      }

      // FPS実測(1秒窓)
      this.frameCount += 1
      const windowStart = this.fpsWindowStart ?? timeMs
      const elapsed = timeMs - windowStart
      if (elapsed >= 1000) {
        this.fpsValue = (this.frameCount * 1000) / elapsed
        this.frameCount = 0
        this.fpsWindowStart = timeMs
      }
    }

    const alpha = this.accumulator / this.stepMs
    for (const callback of this.renderCallbacks) callback(alpha)

    this.frameHandle = this.requestFrame(this.frame)
  }
}
