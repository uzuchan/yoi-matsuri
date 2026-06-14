import { useEffect, useRef } from 'react'
import type { StallOutcome } from '../game/result'

/**
 * 結果オーバーレイ(T-007 段B / GDD §3.2・INTERACTION_SPEC §3.4・§4・ART §2)。
 *
 * 役割: ResultScene から橋渡しされる結果(段・見出し・店主セリフ・報酬)を ART §2 準拠で描画し、
 * 「参道へ戻る」ボタンのクリック確定を onReturn で合成点(App)→ResultScene へ集約する。
 * キーボード経路(Enter)は ResultScene が InputManager で受けるため、本コンポーネントは
 * マウス経路(ボタンクリック)を担う(マウスのみ・キーボードのみ両方で進められる / §1原則)。
 *
 * 報酬は結果画面に視覚表示する(アイコン+名前)。獲得した報酬が所持品スロットへ「飛んで入る」
 * 0.8s アニメ(INTERACTION_SPEC §3.4)は ui/InventorySlot 側で、獲得を検知して再生する。
 *
 * ART §2: テキスト #f5f0e8 / アクセント #ff9d45 / 背景 #0a0e2e の80%透過パネル。
 * INTERACTION_SPEC §5: テキスト16px以上・フォーカスリング表示。
 * .hud-root は pointer-events:none のため、本コンポーネントのパネルで pointer-events:auto を有効化する。
 */
export interface ResultProps {
  /** 表示する結果(ResultScene 由来。合成点が橋渡し)。 */
  outcome: StallOutcome
  /** 「参道へ戻る」確定(マウス経路)。合成点が ResultScene.requestReturn へ集約する。 */
  onReturn: () => void
}

export function Result({ outcome, onReturn }: ResultProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  // マウスのみでも進められるよう、表示時に「参道へ戻る」ボタンへフォーカスを当てる
  // (キーボードでも Tab 不要で Enter 確定でき、フォーカスリングが見える / §5・§1原則)。
  // ※キーボード Enter は ResultScene 側でも拾うため、ボタンの onClick とは二重に確定要求が
  //   走りうるが、ResultScene.requestReturn が returning ガードで 1 回に集約する。
  useEffect(() => {
    const id = window.setTimeout(() => buttonRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="result" role="dialog" aria-label="金魚すくいの結果" aria-modal="true">
      <div className={`result__panel result__panel--${outcome.tier}`}>
        <h1 className="result__heading">{outcome.heading}</h1>

        <p className="result__line">
          <span className="result__speaker">店主</span>
          <span className="result__line-text">{outcome.shopkeeperLine}</span>
        </p>

        <div className="result__reward" aria-label="獲得した報酬">
          <span className="result__reward-icon" aria-hidden="true">
            {outcome.reward.icon}
          </span>
          <span className="result__reward-name">{outcome.reward.name}</span>
        </div>

        <button
          ref={buttonRef}
          type="button"
          className="result__button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onReturn}
        >
          参道へ戻る
        </button>
      </div>
    </div>
  )
}
