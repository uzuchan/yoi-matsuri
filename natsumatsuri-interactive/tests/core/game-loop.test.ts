import { describe, expect, it } from 'vitest'
import { GameLoop } from '../../src/core/GameLoop'

/** rAFの代わりにテストから手動でフレームを進めるドライバ。 */
function createFrameDriver() {
  let nextHandle = 1
  const pending = new Map<number, (timeMs: number) => void>()
  return {
    requestFrame(callback: (timeMs: number) => void): number {
      const handle = nextHandle
      nextHandle += 1
      pending.set(handle, callback)
      return handle
    },
    cancelFrame(handle: number): void {
      pending.delete(handle)
    },
    /** 保留中のフレームコールバックを指定時刻で発火する。 */
    fire(timeMs: number): void {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback(timeMs)
    },
    get pendingCount(): number {
      return pending.size
    },
  }
}

function createLoop(options: { maxFrameDelta?: number } = {}) {
  const driver = createFrameDriver()
  const loop = new GameLoop({
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
    ...options,
  })
  return { driver, loop }
}

describe('GameLoop', () => {
  it('経過時間に応じて固定タイムステップのupdateが累積回数どおり呼ばれる(dtは常に1/60)', () => {
    const { driver, loop } = createLoop()
    const dts: number[] = []
    loop.onUpdate((dt) => dts.push(dt))

    loop.start()
    driver.fire(0) // 初回フレームは基準時刻の記録のみ
    driver.fire(170) // 170ms ≒ 10ステップ
    expect(dts).toHaveLength(10)

    driver.fire(340) // さらに170ms → 累積20ステップ
    expect(dts).toHaveLength(20)

    expect(dts.every((dt) => Math.abs(dt - 1 / 60) < 1e-12)).toBe(true)
  })

  it('巨大なフレームスパイクは累積上限でクランプされ、updateが暴走しない', () => {
    const { driver, loop } = createLoop({ maxFrameDelta: 250 })
    let updates = 0
    loop.onUpdate(() => {
      updates += 1
    })

    loop.start()
    driver.fire(0)
    driver.fire(5000) // 5秒のスパイク(クランプなしなら約300ステップ)

    expect(updates).toBeGreaterThan(0)
    expect(updates).toBeLessThanOrEqual(15) // 250ms / (1000/60)ms ≒ 15ステップが上限
  })

  it('fpsが直近1秒の実測フレームレートを返す(計測窓が満ちるまでは0)', () => {
    const { driver, loop } = createLoop()
    loop.start()
    driver.fire(0)

    // 20ms間隔(50fps相当)で1秒ぶんフレームを進める
    for (let timeMs = 20; timeMs <= 1000; timeMs += 20) {
      driver.fire(timeMs)
      if (timeMs < 1000) expect(loop.fps).toBe(0)
    }

    expect(loop.fps).toBeCloseTo(50, 5)
  })

  it('renderは毎フレーム呼ばれ、alphaは[0, 1)の補間係数になる', () => {
    const { driver, loop } = createLoop()
    const alphas: number[] = []
    loop.onRender((alpha) => alphas.push(alpha))

    loop.start()
    driver.fire(0)
    driver.fire(25) // 1ステップ消化 + 残り8.33ms → alpha ≒ 0.5

    expect(alphas).toHaveLength(2)
    expect(alphas.every((alpha) => alpha >= 0 && alpha < 1)).toBe(true)
    expect(alphas[1]).toBeCloseTo(0.5, 2)
  })

  it('stopで保留中のフレームがキャンセルされ、以後update/renderは呼ばれない', () => {
    const { driver, loop } = createLoop()
    let updates = 0
    let renders = 0
    loop.onUpdate(() => {
      updates += 1
    })
    loop.onRender(() => {
      renders += 1
    })

    loop.start()
    driver.fire(0)
    expect(driver.pendingCount).toBe(1)

    loop.stop()
    expect(driver.pendingCount).toBe(0)

    driver.fire(1000)
    expect(updates).toBe(0)
    expect(renders).toBe(1) // fire(0)の1回のみ
  })
})
