import { useEffect, useState } from 'react'
import type { DialogueController, DialogueView, EventBus } from '../core'
import type { GoldfishHudState } from '../scenes/goldfish/GoldfishScene'
import { Dialogue } from './Dialogue'
import { GoldfishHud } from './GoldfishHud'

/**
 * 段B(gameplay-engineer)が実装する会話ボックスコンポーネントの props 契約。
 *
 * HudRoot は EventBus の 'dialogue:view-changed' を購読して最新の DialogueView を React state へ
 * 橋渡しし(D-008: HUD は購読のみ・単一経路同期)、会話が active のとき Dialogue を描画する。
 * クリック入力(セリフ送り・選択肢フォーカス/確定)は Dialogue が controller を直接呼ぶ
 * (D-008: クリック経路。キーボード経路は DialogueScene が担う)。
 *
 * 段Bの実装場所: src/ui/Dialogue.tsx
 *   - view を ART §2 準拠で描画(テキスト #f5f0e8 / フォーカス #ff9d45 / 80%透過パネル, 16px以上)
 *   - view.visibleText を表示。view.typing 中はクリックで controller.advance()(全文即時表示)
 *   - view.choices をボタン列で表示。ホバーで controller.focus(i)、クリックで controller.confirm()
 *   - 各操作で AUDIO_SPEC §4 の 'sfx:play'(dialogue-next/select/confirm)を events.emit する
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
  /** core の EventBus。HudRoot はこれを購読して会話表示状態を受け取る。 */
  events: EventBus
  /**
   * 会話の状態機械(段Bの具象)。クリック入力の集約先として Dialogue へ渡す。
   * 段Bで具象 DialogueController を App.tsx で生成・注入するまでは null。
   * null の間は会話オーバーレイを描画しない(土台のみ。ダミーUIは出さない)。
   */
  controller: DialogueController | null
  /**
   * 金魚すくい HUD の表示状態(T-006)。GoldfishScene が setHudListener で合成点(App.tsx)へ流し、
   * App が React state にして渡す(EventBus 非経由。会話 HUD と排他で表示する)。
   */
  goldfishHud: GoldfishHudState | null
}

/**
 * HUD のReactルート(T-004 段A / D-008)。canvas の上に重ねてマウントする。
 *
 * 役割は「EventBus → React state ブリッジ」と「会話オーバーレイ(段B: ui/Dialogue)のマウント枠」のみ。
 * 段A時点では Dialogue コンポーネント本体は未実装のため、描画スロット(下記コメント箇所)を用意するだけで、
 * プレースホルダUI・ダミー表示は出さない(基盤は型と配線で完結させ、中身は段Bが入れる)。
 *
 * 段Bの結線手順:
 *   1. src/ui/Dialogue.tsx を実装し DialogueProps を受ける
 *   2. 下の「描画スロット」コメント箇所に <Dialogue view={...} controller={controller} events={events} /> を置く
 *   3. App.tsx で具象 DialogueController を生成し HudRoot の controller prop と DialogueScene へ注入する
 */
export function HudRoot({ events, controller, goldfishHud }: HudRootProps) {
  const [view, setView] = useState<DialogueView | null>(null)

  useEffect(() => {
    // 単一経路同期(D-008): DialogueScene が発火する表示状態を購読し React state へ橋渡しする。
    const unsubscribeView = events.on('dialogue:view-changed', ({ view: next }) => {
      setView(next)
    })
    // dialogue シーンを抜けたら会話オーバーレイを確実に閉じる(マウス確定経路では合成点が
    // 即座に遷移するため、抜けた後の view-changed(active:false)が届かないことがある)。
    // HUD は購読のみ(単一経路同期は維持)。to が dialogue 以外なら表示状態をクリアする。
    const unsubscribeScene = events.on('scene:transition', ({ to }) => {
      if (to !== 'dialogue') setView(null)
    })
    return () => {
      unsubscribeView()
      unsubscribeScene()
    }
  }, [events])

  // 会話が active かつ controller(段Bの具象)が注入済みのときだけオーバーレイを描画する。
  // 段Bで <Dialogue> を有効化するための条件(view/controller/events を消費する真の配線)。
  const showDialogue = controller !== null && view !== null && view.active

  // 金魚 HUD は「金魚すくい active」かつ「会話オーバーレイを出していない」ときだけ描画する(排他)。
  const showGoldfishHud = goldfishHud !== null && goldfishHud.active && !showDialogue

  return (
    <div className="hud-root" aria-live="polite">
      {/*
        会話オーバーレイ(段B: ui/Dialogue.tsx)。
        showDialogue = controller 注入済み && view.active のときのみ描画する(単一経路同期)。
        view / controller は showDialogue が true のとき非 null が保証される。
      */}
      {showDialogue && <Dialogue view={view} controller={controller} events={events} />}
      {/* 金魚すくい HUD(T-006)。会話と排他(showDialogue 中は出さない)。 */}
      {showGoldfishHud && <GoldfishHud state={goldfishHud} />}
    </div>
  )
}
