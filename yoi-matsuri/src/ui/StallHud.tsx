import { useEffect, useRef, useState } from 'react'
import type { StallHudState } from '../scenes/stall'

/**
 * 汎用屋台 HUD(STALL_FRAMEWORK §2.6 / D-010)。GoldfishHud を一般化した
 * 「残り時間 + 汎用ゲージ(0..1)+ スコア」。屋台ごとの専用 HUD が要るまで、これ1本で賄う。
 *
 * 既存の金魚 HUD(T-006 / GDD §5・INTERACTION_SPEC §4・ART §2)と **DOM 構造・CSS クラスを完全に同一**
 * に保つ(.goldfish-hud*)。これで金魚すくいの見た目・配置・スタイル・e2e セレクタが回帰0のまま
 * 多屋台へ一般化される(CSS は無改修。クラス名は金魚由来だが「汎用屋台 HUD のスタイル」として共有する)。
 *
 * 表示要素:
 *  - 残り時間(秒)。timeRemaining < 0 の屋台(制限時間なし)は時間表示を省く。
 *  - 汎用ゲージ(耐久/弾数/温度…。0..1。残量 ratio<=0.3 で点滅)。gauge=null なら省く。
 *  - スコア(確保数/命中点…)と単位ラベル。
 *  - 開始時 2 秒だけ操作ヒント(金魚: そっと動かそう。速く動かすと紙が破れる)。
 *
 * すべてマウス不要で読める(pointer-events:none)。会話/結果オーバーレイとは HudRoot が排他制御する。
 */
export interface StallHudProps {
  /** 最新の HUD 状態(StallScene 由来。合成点が橋渡し)。 */
  state: StallHudState
}

const WARNING_RATIO = 0.3 // 残30以下(GDD §4.4 / §4.6)= ゲージ点滅しきい値
const HINT_DURATION_MS = 2000

export function StallHud({ state }: StallHudProps) {
  const { active, timeRemaining, gauge, score, scoreLabel, scoreUnit, hint } = state

  // 開始ヒント: active に切り替わった瞬間から 2 秒だけ表示する(GoldfishHud と同方針)。
  const [showHint, setShowHint] = useState(false)
  const prevActive = useRef(false)
  useEffect(() => {
    if (!active) {
      prevActive.current = false
      return undefined
    }
    if (prevActive.current) return undefined
    prevActive.current = true
    const showTimer = window.setTimeout(() => setShowHint(true), 0)
    const hideTimer = window.setTimeout(() => setShowHint(false), HINT_DURATION_MS)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [active])

  if (!active) return null

  const showTime = timeRemaining >= 0
  const seconds = Math.max(0, Math.ceil(timeRemaining))
  const warning = gauge !== null && gauge.ratio <= WARNING_RATIO
  const pct = gauge !== null ? Math.max(0, Math.min(1, gauge.ratio)) * 100 : 0

  return (
    <div className="goldfish-hud" aria-live="polite">
      <div className="goldfish-hud__top">
        {showTime && (
          <div className="goldfish-hud__time" role="timer" aria-label="残り時間">
            <span className="goldfish-hud__label">のこり</span>
            <span className="goldfish-hud__time-value">{seconds}</span>
            <span className="goldfish-hud__unit">秒</span>
          </div>
        )}
        <div className="goldfish-hud__secured" aria-label={scoreLabel}>
          <span className="goldfish-hud__label">{scoreLabel}</span>
          <span className="goldfish-hud__secured-value">{score}</span>
          <span className="goldfish-hud__unit">{scoreUnit}</span>
        </div>
      </div>

      {gauge !== null && (
        <div className="goldfish-hud__gauge" aria-label={gauge.label}>
          <span className="goldfish-hud__gauge-label">{gauge.label}</span>
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
      )}

      {showHint && hint && (
        <div className="goldfish-hud__hint" role="status">
          {hint}
        </div>
      )}
    </div>
  )
}
