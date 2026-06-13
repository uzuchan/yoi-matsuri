import { describe, expect, it } from 'vitest'
import { GoldfishSession, DEFAULT_TANK_BOUNDS } from '../../src/game/goldfish'
import { isOverBowl } from '../../src/scenes/goldfish/projection'

/**
 * GoldfishScene が組み立てる入力(target / submerge / secure)で、実際に
 * 「金魚をすくう → お椀へ運ぶ → 確保(secure)」が成立し確保数が増えることを、
 * 実 GoldfishSession(T-005)で決定論的に固定する統合テスト(T-006 AC4/AC6)。
 *
 * 物理は T-005 が真実。本テストは「シーンが渡す入力の形」が確保を成立させられることの担保
 * (ブラウザ操作では金魚 AI の逃避で難度が高いため、ここでロジック到達性を固定する)。
 */

const DT = 1 / 60
// シーンと同じお椀位置(水槽外 +x)。GoldfishScene の BOWL_OFFSET_X / BOWL_RADIUS と一致。
const BOWL_CENTER = { x: DEFAULT_TANK_BOUNDS.radiusX + 0.24, z: 0 }
const BOWL_RADIUS = 0.16

describe('GoldfishScene 入力での すくう→運ぶ→確保 フロー', () => {
  it('金魚へ空中で寄せ→素早く沈めて持ち上げ→お椀へ運び secure すると secured=1', () => {
    const s = new GoldfishSession({ seed: 7 })

    // 金魚を狙って「空中で寄せる(逃げない)→素早く沈めて即持ち上げる」を試行する。
    // (GDD §4.6: 水中ポイが逃避半径に入ると逃げ始めるので、沈めて待たず即持ち上げるのが定石。)
    let caughtOk = false
    let cur = { x: 0, z: 0 }
    // 1 匹を狙い、毎フレーム最新位置へ空中追従(逃げない)。ポイが円内に十分入ったら
    // 1 フレーム沈めて即持ち上げる(逃げる前に・低速で捕獲)。
    const targetId = s.fishStates.find((f) => f.status === 'swimming')?.id ?? 0
    for (let i = 0; i < 600 && !caughtOk; i++) {
      const fish = s.fishStates[targetId]
      if (fish.status !== 'swimming') break
      const t = { x: fish.position.x, z: fish.position.z }
      // 空中で金魚へ近づき続ける(submerge:false → 逃避トリガしない)。
      s.update(DT, { target: t, submerge: false })
      const poi = s.poiState.position
      const dist = Math.hypot(poi.x - t.x, poi.z - t.z)
      // ポイが金魚にほぼ重なり、かつ低速になったら素早く沈め→即持ち上げ。
      if (dist <= 0.05 && s.poiState.speed <= 0.1) {
        const f2 = s.fishStates[targetId]
        const t2 = { x: f2.position.x, z: f2.position.z }
        s.update(DT, { target: t2, submerge: true }) // 沈めるエッジ
        const liftEvents = s.update(DT, { target: t2, submerge: false }) // 即持ち上げ
        if (liftEvents.some((e) => e.type === 'caught')) {
          caughtOk = true
          cur = t2
        }
      }
    }
    expect(caughtOk, '空中で金魚へ寄せ素早く沈め持ち上げると捕獲できる').toBe(true)
    expect(s.totalCaught).toBeGreaterThanOrEqual(1)

    // 3) お椀へゆっくり運ぶ(目標を少しずつお椀中心へ。onPoi の金魚はポイに追従する)。
    for (let i = 0; i < 240; i++) {
      cur = {
        x: cur.x + (BOWL_CENTER.x - cur.x) * 0.05,
        z: cur.z + (BOWL_CENTER.z - cur.z) * 0.05,
      }
      s.update(DT, { target: cur, submerge: false })
      if (s.currentStatus !== 'playing') break
    }
    // お椀の上に到達している(シーンの判定関数と同一)。
    expect(isOverBowl(s.poiState.position, BOWL_CENTER, BOWL_RADIUS)).toBe(true)

    // 4) お椀の上で secure(シーンはお椀上クリックで secure:true を渡す)。
    const secureEvents = s.update(DT, { target: cur, submerge: false, secure: true })
    const secured = secureEvents.filter((e) => e.type === 'secured')
    expect(secured.length).toBeGreaterThanOrEqual(1)
    expect(s.securedCount).toBeGreaterThanOrEqual(1)
    // 確保した金魚は secured 状態になる(お椀へ移った=水槽から消える描画の根拠)。
    expect(s.fishStates.some((f) => f.status === 'secured')).toBe(true)
  })

  it('お椀の外ではシーンが secure を出さないため確保数は増えない', () => {
    const s = new GoldfishSession({ seed: 7 })
    // 水槽中心付近(お椀の外)はシーンの isOverBowl=false。
    const here = { x: 0, z: 0 }
    expect(isOverBowl(here, BOWL_CENTER, BOWL_RADIUS)).toBe(false)
    // お椀外ではシーンが secure:true を渡さない運用 → 何匹乗っていても確保数は増えない。
    for (let i = 0; i < 60; i++) s.update(DT, { target: here, submerge: false })
    expect(s.securedCount).toBe(0)
  })
})
