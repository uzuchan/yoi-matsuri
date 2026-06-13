/**
 * 決定論的シード付き乱数(金魚 AI の wander 目標選択などに使う)。
 *
 * AC5 / Risk(2): 金魚 AI を再現可能・テスト可能にするため、game 内に閉じた seeded PRNG を持つ
 * (core/rng には依存しない)。同じ seed からは必ず同じ系列が出る。
 *
 * アルゴリズムは mulberry32(32bit, 高速・十分な分布)。three / react / DOM 非依存。
 */
export class SeededRandom {
  private state: number

  /** seed は任意の整数。同一 seed なら同一系列(再現可能)。 */
  constructor(seed: number) {
    // 0 を含む任意整数を 32bit に丸める。0 でも mulberry32 は退化しない。
    this.state = seed >>> 0
  }

  /** 次の乱数 [0, 1)。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max) の一様乱数。 */
  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }
}
