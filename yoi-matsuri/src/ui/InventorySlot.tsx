import { useEffect, useState } from 'react'
import type { RewardInfo } from '../game/result'

/**
 * 所持品スロット(T-007 / GDD §5・INTERACTION_SPEC §3.4・ART §2)。
 *
 * approach 画面の右下に、金魚すくいで獲得した報酬を蓄積表示する(表示のみ・使用機能なし。ただし
 * 実動作で、獲得が実際に積み上がって表示される / AC5)。新しい報酬が増えたときは、画面中央付近から
 * スロットへ「飛んで入る」0.8s アニメ(INTERACTION_SPEC §3.4)を 1 回再生する。
 *
 * フライイン演出の起点は合成点(App)が制御する: 報酬を「参道へ戻る」で所持品へ追加した瞬間に
 * flyToken を更新する。本コンポーネントは flyToken の変化を検知し、末尾アイテムへ 0.8s だけ
 * フライインクラスを付ける(初回獲得=空→1件のマウント時でも演出が再生される)。
 *
 * すべてマウス不要で読める(pointer-events:none で操作を奪わない)。
 * ART §2: テキスト #f5f0e8 / アクセント #ff9d45 / 背景 #0a0e2e の80%透過パネル。
 */
export interface InventorySlotProps {
  /** これまでに獲得した報酬(追加順)。最後の要素が直近の獲得。 */
  items: readonly RewardInfo[]
  /**
   * フライイン演出のトリガートークン(合成点が報酬追加時に更新する単調増加値)。
   * 0 のときは演出なし。値が前回と変われば末尾アイテムを 0.8s だけ「飛んで入る」表示にする。
   */
  flyToken: number
}

/** フライイン演出の長さ(INTERACTION_SPEC §3.4: 0.8s)。 */
const FLY_DURATION_MS = 800

export function InventorySlot({ items, flyToken }: InventorySlotProps) {
  // 演出中なら、末尾アイテム(直近獲得)へフライインクラスを付ける。
  const [flying, setFlying] = useState(false)

  // setState はマウント後の非同期 timer 経由で行う(effect 内の同期 setState を避ける /
  // GoldfishHud と同方針)。flyToken の立ち上がりで演出を出し、0.8s 後に通常表示へ戻す。
  useEffect(() => {
    if (flyToken <= 0) return undefined
    const showId = window.setTimeout(() => setFlying(true), 0)
    const hideId = window.setTimeout(() => setFlying(false), FLY_DURATION_MS)
    return () => {
      window.clearTimeout(showId)
      window.clearTimeout(hideId)
    }
  }, [flyToken])

  if (items.length === 0) return null

  const lastIndex = items.length - 1

  return (
    <div className="inventory" aria-label="所持品" aria-live="polite">
      <span className="inventory__label">所持品</span>
      <ul className="inventory__list">
        {items.map((item, index) => (
          <li
            key={`${item.id}-${index}`}
            className={`inventory__item${flying && index === lastIndex ? ' inventory__item--flying' : ''}`}
            title={item.name}
          >
            <span className="inventory__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="inventory__name">{item.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
