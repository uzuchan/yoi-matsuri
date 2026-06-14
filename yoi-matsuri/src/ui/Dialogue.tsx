import { useCallback } from 'react'
import type { DialogueProps } from './HudRoot'

/**
 * 会話ボックス + 選択肢コンポーネント(T-004 段B / D-008)。
 *
 * 役割: HudRoot から渡される最新の DialogueView を ART §2 準拠で描画し、クリック入力を
 * controller へ集約する(D-008: クリック経路。キーボード経路は DialogueScene が担う)。
 * 表示状態の同期は単一経路(DialogueScene→'dialogue:view-changed'→HudRoot)を守るため、
 * 本コンポーネントは controller を呼ぶだけで、自前で再描画用 state は持たない
 * (controller の状態変化は次フレームの DialogueScene.update が検知し view-changed を発火する)。
 *
 * 操作(INTERACTION_SPEC §3.2):
 * - セリフ表示中のクリック → controller.advance()(送り中なら全文即時表示 / 表示済みなら次へ)+ 'dialogue-next'
 * - 選択肢ホバー → controller.focus(i) + 'select'
 * - 選択肢クリック → controller.confirm() + 'confirm'
 *
 * .hud-root は pointer-events:none のため、本コンポーネントのパネルで pointer-events:auto を有効化する。
 */
export function Dialogue({ view, controller, events }: DialogueProps) {
  const showChoices = view.choices.length > 0

  // セリフ送り(パネルクリック)。送り中は全文即時表示、表示済みなら次セリフへ。
  // 締めセリフ(「またあとで」→「おう、また来な!」)を送り切ると choice 結末になるため、
  // その場合は 'dialogue:choice' を発火して合成点(App)の遷移へ集約する(マウス経路の確定)。
  const handleAdvance = useCallback(() => {
    const outcome = controller.advance()
    events.emit('sfx:play', { name: 'dialogue-next' })
    if (outcome.kind === 'choice') {
      events.emit('dialogue:choice', { choiceId: outcome.choiceId })
    }
  }, [controller, events])

  // 選択肢ホバー → フォーカス移動(AUDIO_SPEC §4: select)。
  const handleFocus = useCallback(
    (index: number) => {
      // 既にフォーカス済みなら select 音を重複させない。
      if (index === view.focusedChoiceIndex) return
      controller.focus(index)
      events.emit('sfx:play', { name: 'select' })
    },
    [controller, events, view.focusedChoiceIndex],
  )

  // 選択肢確定 → 確定(AUDIO_SPEC §4: confirm)。
  // 「遊んでいく」は即 choice 結末 → 'dialogue:choice' を発火(マウス経路の確定)。
  // 「またあとで」は締めセリフ表示へ(continue)→ 送り切りで handleAdvance が choice を発火する。
  const handleConfirm = useCallback(
    (index: number) => {
      controller.focus(index)
      const outcome = controller.confirm()
      events.emit('sfx:play', { name: 'confirm' })
      if (outcome.kind === 'choice') {
        events.emit('dialogue:choice', { choiceId: outcome.choiceId })
      }
    },
    [controller, events],
  )

  // .hud-root は pointer-events:none だが、会話要素は pointer-events:auto。
  // ここでマウス押下を window へ伝播させない(InputManager が拾うと DialogueScene の
  // キーボード/マウス経路と二重駆動になり、セリフ送りの取りこぼし・飛ばしが起きるため)。
  // マウス入力は本コンポーネントが controller へ単一集約する(D-008: クリック経路)。
  const stopMouseDown = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation()
  }, [])

  return (
    <div className="dialogue" role="dialog" aria-label="店主との会話">
      {showChoices ? (
        // --- 選択肢パネル ---
        <div className="dialogue__choices" role="listbox" aria-label="選択肢">
          {view.choices.map((choice, index) => {
            const focused = index === view.focusedChoiceIndex
            return (
              <button
                key={choice.id}
                type="button"
                role="option"
                aria-selected={focused}
                className={`dialogue__choice${focused ? ' dialogue__choice--focused' : ''}`}
                onMouseEnter={() => handleFocus(index)}
                onMouseDown={stopMouseDown}
                onClick={() => handleConfirm(index)}
              >
                {choice.label}
              </button>
            )
          })}
        </div>
      ) : (
        // --- セリフパネル(クリックで送り) ---
        <button
          type="button"
          className="dialogue__panel"
          aria-label="セリフを送る"
          onMouseDown={stopMouseDown}
          onClick={handleAdvance}
        >
          {view.speaker !== '' && <span className="dialogue__speaker">{view.speaker}</span>}
          <span className="dialogue__text">
            {view.visibleText}
            {view.typing && <span className="dialogue__caret" aria-hidden="true" />}
          </span>
          {!view.typing && (
            <span className="dialogue__hint" aria-hidden="true">
              クリック / Enter / Space で送る
            </span>
          )}
        </button>
      )}
    </div>
  )
}
