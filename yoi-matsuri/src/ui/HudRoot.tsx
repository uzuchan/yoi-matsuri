import { useEffect, useState } from 'react'
import type { DialogueController, DialogueView, EventBus, SceneId } from '../core'
import type { StallHudState } from '../scenes/stall'
import type { ResultHudState } from '../scenes/result/ResultScene'
import type { RewardInfo } from '../game/result'
import { Dialogue } from './Dialogue'
import { StallHud } from './StallHud'
import { Result } from './Result'
import { InventorySlot } from './InventorySlot'

/**
 * 会話ボックスコンポーネントの props 契約(D-008)。
 *
 * HudRoot は EventBus の 'dialogue:view-changed' を購読して最新の DialogueView を React state へ
 * 橋渡しし(D-008: HUD は購読のみ・単一経路同期)、会話が active のとき Dialogue を描画する。
 * クリック入力(セリフ送り・選択肢フォーカス/確定)は Dialogue が controller を直接呼ぶ
 * (D-008: クリック経路。キーボード経路は DialogueScene が担う)。controller は屋台ごとに
 * 異なるため、DialogueScene が enter で解決したアクティブ controller を合成点が橋渡しする(D-010)。
 */
export interface DialogueProps {
  /** 最新の会話表示状態(EventBus 由来)。 */
  view: DialogueView
  /** クリック入力を会話状態機械へ渡すための controller(キーボードと同一の集約先 = D-008)。 */
  controller: DialogueController
  /** 'sfx:play' 等の発火に使う EventBus。 */
  events: EventBus
}

interface HudRootProps {
  /** core の EventBus。HudRoot はこれを購読して会話表示状態・シーン遷移を受け取る。 */
  events: EventBus
  /**
   * アクティブ会話の状態機械(DialogueScene が enter で解決したもの。クリック入力の集約先)。
   * 会話シーン外では null(会話オーバーレイを描画しない)。
   */
  controller: DialogueController | null
  /**
   * 屋台ミニゲーム HUD の表示状態。StallScene(MinigameScene 経由)が setHudListener で合成点へ流し、
   * App が React state にして渡す(EventBus 非経由。会話/結果 HUD と排他で表示する)。
   */
  stallHud: StallHudState | null
  /**
   * 結果 HUD の表示状態。ResultScene が setResultListener で合成点へ流し、App が React state にして渡す
   * (EventBus 非経由。会話/ミニゲーム HUD と排他で表示する)。
   */
  resultHud: ResultHudState | null
  /** 「参道へ戻る」確定(マウス経路)。合成点が ResultScene.requestReturn へ集約する。 */
  onResultReturn: () => void
  /** これまでに獲得した報酬(所持品スロット。approach 表示中に右下へ出す)。 */
  inventory: readonly RewardInfo[]
  /** 所持品フライイン演出のトリガートークン(合成点が報酬追加時に更新する単調増加値)。 */
  inventoryFlyToken: number
}

/**
 * HUD のReactルート(D-008、StallFramework 移行 D-010)。canvas の上に重ねてマウントする。
 *
 * 役割は「EventBus → React state ブリッジ」と各オーバーレイ(会話/ミニゲーム/結果/所持品)のマウント枠。
 * 会話・ミニゲーム・結果のオーバーレイは排他で表示する(同時に 2 つ出さない)。所持品スロットは approach
 * 表示中に常設で出す(現在シーンを scene:transition から追跡して制御する)。
 */
export function HudRoot({
  events,
  controller,
  stallHud,
  resultHud,
  onResultReturn,
  inventory,
  inventoryFlyToken,
}: HudRootProps) {
  const [view, setView] = useState<DialogueView | null>(null)
  // 現在のシーン(所持品スロットを approach 表示中だけ出すために追跡する)。
  const [currentScene, setCurrentScene] = useState<SceneId>('approach')

  useEffect(() => {
    // 単一経路同期(D-008): DialogueScene が発火する表示状態を購読し React state へ橋渡しする。
    const unsubscribeView = events.on('dialogue:view-changed', ({ view: next }) => {
      setView(next)
    })
    // シーン遷移を購読し、(1) dialogue を抜けたら会話オーバーレイを閉じる、
    // (2) 所持品スロットの表示制御に使う現在シーンを更新する。
    const unsubscribeScene = events.on('scene:transition', ({ to }) => {
      if (to !== 'dialogue') setView(null)
      setCurrentScene(to)
    })
    return () => {
      unsubscribeView()
      unsubscribeScene()
    }
  }, [events])

  // 会話が active かつ controller(アクティブ屋台の具象)が注入済みのときだけオーバーレイを描画する。
  const showDialogue = controller !== null && view !== null && view.active

  // 結果は最優先で排他(終了直後に出る)。会話/ミニゲームを出さない。
  const showResult = resultHud !== null && resultHud.active && resultHud.outcome !== null

  // ミニゲーム HUD は「ミニゲーム active」かつ「会話/結果オーバーレイを出していない」ときだけ描画する(排他)。
  const showStallHud = stallHud !== null && stallHud.active && !showDialogue && !showResult

  // 所持品スロットは approach 表示中に右下へ常設表示する(GDD §5)。
  const showInventory = currentScene === 'approach'

  return (
    <div className="hud-root" aria-live="polite">
      {/* 会話オーバーレイ(ui/Dialogue.tsx)。showDialogue = controller 注入済み && view.active のみ。 */}
      {showDialogue && <Dialogue view={view} controller={controller} events={events} />}
      {/* 屋台ミニゲーム HUD。会話/結果と排他。 */}
      {showStallHud && <StallHud state={stallHud} />}
      {/* 結果オーバーレイ。会話/ミニゲームと排他。 */}
      {showResult && <Result outcome={resultHud.outcome} onReturn={onResultReturn} />}
      {/* 所持品スロット。approach 右下に獲得報酬を蓄積表示。 */}
      {showInventory && <InventorySlot items={inventory} flyToken={inventoryFlyToken} />}
    </div>
  )
}
