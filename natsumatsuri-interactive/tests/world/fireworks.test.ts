import { describe, expect, it } from 'vitest'
import {
  FireworkShell,
  pickBurst,
  FIREWORK_COLORS,
  PARTICLE_MIN,
  PARTICLE_MAX,
  LAUNCH_TO_BURST,
  BURST_LIFETIME,
} from '../../src/world/fireworks'

describe('花火 FireworkShell(ART §3 軌道/寿命/3段階)', () => {
  it('起動直後は launch 段で、粒数は 120〜200 の範囲', () => {
    const shell = new FireworkShell()
    shell.launch({ x: 0, y: 28, z: -40 }, FIREWORK_COLORS[0], 5)
    expect(shell.phase).toBe('launch')
    expect(shell.particleCount).toBeGreaterThanOrEqual(PARTICLE_MIN)
    expect(shell.particleCount).toBeLessThanOrEqual(PARTICLE_MAX)
    expect(shell.isIdle).toBe(false)
  })

  it('launch から約 1.2s 後に burst へ遷移し、その更新でだけ true を返す(開花通知は単発)', () => {
    const shell = new FireworkShell()
    shell.launch({ x: 0, y: 28, z: -40 }, FIREWORK_COLORS[1], 7)
    // 1.1s では未開花。
    let burst = shell.update(1.1)
    expect(shell.phase).toBe('launch')
    expect(burst).toBe(false)
    // さらに 0.2s で LAUNCH_TO_BURST(1.2s)を越え burst 通知が一度だけ。
    burst = shell.update(0.2)
    expect(shell.phase).toBe('burst')
    expect(burst).toBe(true)
    // 次の更新では二度と true にしない(単発)。
    burst = shell.update(0.1)
    expect(burst).toBe(false)
  })

  it('LAUNCH_TO_BURST = 1.2s(AUDIO_SPEC §3 と一致)', () => {
    expect(LAUNCH_TO_BURST).toBeCloseTo(1.2, 6)
  })

  it('開花後 BURST_LIFETIME(約1.8s)を過ぎると idle(再利用可)へ戻る', () => {
    const shell = new FireworkShell()
    shell.launch({ x: 0, y: 28, z: -40 }, FIREWORK_COLORS[2], 9)
    shell.update(LAUNCH_TO_BURST) // → burst
    expect(shell.phase).toBe('burst')
    shell.update(BURST_LIFETIME + 0.01) // 寿命超過
    expect(shell.phase).toBe('idle')
    expect(shell.isIdle).toBe(true)
    expect(shell.particleCount).toBe(0)
    expect(shell.alpha).toBe(0)
  })

  it('開花直後の粒は開花点近傍に集まり、時間経過で重力により下方へ落ちる', () => {
    const shell = new FireworkShell()
    const burstY = 28
    shell.launch({ x: 0, y: burstY, z: -40 }, FIREWORK_COLORS[0], 3)
    shell.update(LAUNCH_TO_BURST) // burst 開始(t=0)

    // 開花ごく初期の平均 y。
    shell.update(0.05)
    const earlyAvgY = averageY(shell)
    // しばらく後の平均 y。
    shell.update(1.0)
    const lateAvgY = averageY(shell)

    // 重力落下により後の方が低い。
    expect(lateAvgY).toBeLessThan(earlyAvgY)
    // 開花初期は開花点近傍(±数m)に収まる。
    expect(Math.abs(earlyAvgY - burstY)).toBeLessThan(3)
  })

  it('開花の粒は放射状に広がる(初期より後の方が散らばる)', () => {
    const shell = new FireworkShell()
    shell.launch({ x: 0, y: 28, z: -40 }, FIREWORK_COLORS[0], 11)
    shell.update(LAUNCH_TO_BURST)
    shell.update(0.05)
    const earlySpread = horizontalSpread(shell)
    shell.update(0.6)
    const lateSpread = horizontalSpread(shell)
    expect(lateSpread).toBeGreaterThan(earlySpread)
  })

  it('残光: 寿命の後半で alpha が単調に減衰し最終 0 付近へ', () => {
    const shell = new FireworkShell()
    shell.launch({ x: 0, y: 28, z: -40 }, FIREWORK_COLORS[0], 2)
    shell.update(LAUNCH_TO_BURST)
    shell.update(BURST_LIFETIME * 0.5)
    const mid = shell.alpha
    shell.update(BURST_LIFETIME * 0.45)
    const late = shell.alpha
    expect(late).toBeLessThan(mid)
    expect(late).toBeGreaterThanOrEqual(0)
  })

  it('位置バッファは capacity ぶん確保され、毎回 new せず再利用される(同一参照)', () => {
    const shell = new FireworkShell()
    const ref = shell.positions
    shell.launch({ x: 1, y: 28, z: -40 }, FIREWORK_COLORS[0], 4)
    shell.update(0.1)
    shell.update(LAUNCH_TO_BURST)
    shell.update(0.2)
    expect(shell.positions).toBe(ref) // 同じ Float32Array を書き換えている
    expect(shell.positions.length).toBe(PARTICLE_MAX * 3)
  })
})

describe('花火 pickBurst(決定論的な開花点と色)', () => {
  it('同じ seed は同じ開花点・色を返す(再現可能)', () => {
    const a = pickBurst(42)
    const b = pickBurst(42)
    expect(b).toEqual(a)
  })

  it('色は ART §2 の3色のいずれか、位置は既定範囲(上空・鳥居側)に収まる', () => {
    for (let s = 0; s < 50; s++) {
      const { position, color } = pickBurst(s)
      expect(FIREWORK_COLORS).toContain(color)
      expect(position.y).toBeGreaterThan(8) // 夜空(鳥居 y=8 の上空)
      expect(position.z).toBeLessThan(0) // 参道の奥(-Z)側
    }
  })
})

function averageY(shell: FireworkShell): number {
  let sum = 0
  for (let i = 0; i < shell.particleCount; i++) sum += shell.positions[i * 3 + 1]
  return sum / shell.particleCount
}

function horizontalSpread(shell: FireworkShell): number {
  let minX = Infinity
  let maxX = -Infinity
  for (let i = 0; i < shell.particleCount; i++) {
    const x = shell.positions[i * 3]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  return maxX - minX
}
