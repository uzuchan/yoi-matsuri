import { useEffect, useRef, useState } from 'react'
import type { GoldfishHudState } from '../scenes/goldfish/GoldfishScene'

/**
 * 金魚すくい HUD(T-006 / GDD §5・INTERACTION_SPEC §4・ART §2)。
 *
 * 表示要素:
 *  - 残り時間(秒)
 *  - ポイ耐久ゲージ(紙の見た目劣化と連動: 残量で色・幅が変わり、残30以下=ratio<=0.3 で点滅)
 *  - 確保数(お椀の金魚)
 *  - 開始時 2 秒だけ「そっと動かそう。速く動かすと紙が破れる」(INTERACTION_SPEC §4 文言)
 *
 * すべてマウス不要で読める(操作を奪わない pointer-events:none)。会話オーバーレイとは排他で、
 * HudRoot が「会話 active 中は GoldfishHud を出さない」ことで排他を担保する。
 */
export interface GoldfishHudProps {
  /** 最新の HUD 状態(GoldfishScene 由来。合成点が橋渡し)。 */
  state: GoldfishHudState
}

const WARNING_RATIO = 0.3 // 残30以下(GDD §4.4 / §4.6)
const HINT_DURATION_MS = 2000

export function GoldfishHud({ state }: GoldfishHudProps) {
  const { active, timeRemaining, durabilityRatio, secured } = state

  // 開始ヒント: active に切り替わった瞬間から 2 秒だけ表示する。
  // active が false に戻ったときは prevActive を戻すだけ(コンポーネントは null を返すので
  // showHint の値は描画に影響せず、次回 active 化の立ち上がりで再度 true にする。
  // effect 内での同期 setState を避けるため、true 化と false 化は両方 timer/立ち上がり経由で行う)。
  const [showHint, setShowHint] = useState(false)
  const prevActive = useRef(false)
  useEffect(() => {
    if (!active) {
      prevActive.current = false
      return undefined
    }
    if (prevActive.current) return undefined
    // active への立ち上がり: ヒントを 2 秒だけ出す(setState はマウント後の非同期 timer 経由)。
    prevActive.current = true
    const showTimer = window.setTimeout(() => setShowHint(true), 0)
    const hideTimer = window.setTimeout(() => setShowHint(false), HINT_DURATION_MS)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [active])

  if (!active) return null

  const warning = durabilityRatio <= WARNING_RATIO
  const seconds = Math.max(0, Math.ceil(timeRemaining))
  const pct = Math.max(0, Math.min(1, durabilityRatio)) * 100

  return (
    <div className="goldfish-hud" aria-live="polite">
      <div className="goldfish-hud__top">
        <div className="goldfish-hud__time" role="timer" aria-label="残り時間">
          <span className="goldfish-hud__label">のこり</span>
          <span className="goldfish-hud__time-value">{seconds}</span>
          <span className="goldfish-hud__unit">秒</span>
        </div>
        <div className="goldfish-hud__secured" aria-label="すくった数">
          <span className="goldfish-hud__label">すくった</span>
          <span className="goldfish-hud__secured-value">{secured}</span>
          <span className="goldfish-hud__unit">匹</span>
        </div>
      </div>

      <div className="goldfish-hud__gauge" aria-label="ポイの耐久">
        <span className="goldfish-hud__gauge-label">ポイ</span>
        <div className="goldfish-hud__gauge-track">
          <div
            className={`goldfish-hud__gauge-fill${warning ? ' goldfish-hud__gauge-fill--warning' : ''}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          />
        </div>
      </div>

      {showHint && (
        <div className="goldfish-hud__hint" role="status">
          そっと動かそう。速く動かすと紙が破れる
        </div>
      )}
    </div>
  )
}
