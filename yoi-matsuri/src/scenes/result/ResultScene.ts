import type { PerspectiveCamera } from 'three'
import type { EventBus, GameKey, InputManager, Scene, SceneContext } from '../../core'
import type { StallResult } from '../../game/stall'
import { resolveStallResult, type StallOutcome } from '../../game/result'
import type { ApproachScene } from '../approach/ApproachScene'
import type { StallRegistry } from '../stall'
import { computeResultCamera, readStallId } from '../stall'

/**
 * 結果表示の HUD 状態(React へ橋渡しする純データ)。
 *
 * 金魚 HUD(T-006)と同様、EventBus を経由しない: 合成点(App.tsx)が setResultListener で直接
 * React state へ橋渡しする(会話/ミニゲーム HUD と排他で表示する)。
 *
 * StallFramework 移行(D-010): outcome は屋台横断の StallOutcome(tier/score/見出し/店主セリフ/報酬)。
 * 金魚すくいでは score=確保数。表示(ui/Result)は tier/heading/shopkeeperLine/reward のみ使うため
 * 移行前と同一の見え方になる。
 */
export interface ResultHudState {
  /** 結果オーバーレイを表示するか(result シーン中=true、抜けたら false で他HUDと排他)。 */
  readonly active: boolean
  /** 段・見出し・店主セリフ・報酬。active=false のときは null。 */
  readonly outcome: StallOutcome | null
}

/** 結果 HUD 状態の購読者(合成点が React state へ橋渡し)。 */
export type ResultHudListener = (state: ResultHudState) => void

/**
 * 結果シーン(T-007 / GDD §3.2・INTERACTION_SPEC §3.4・D-008 / StallFramework §3.3・§5)。
 *
 * 設計(DialogueScene / D-008 を踏襲):
 * - result は SceneManager のシーン。独自の 3D 世界は作らず、注入された ApproachScene の render を
 *   呼んで背景の参道world(屋台・店主・提灯)を描画する(屋台が結果表示中も見える / AC6)。
 *   world の所有は ApproachScene のまま。プレイヤー・カメラは固定(ApproachScene.update を呼ばない)。
 * - **多屋台パラメータ化(D-010)**: enter の payload で `{ stallId, result: StallResult }` を受け、
 *   `registry.get(stallId).resultRules` で score→{tier/見出し/店主セリフ/報酬} を解決する(§5.2)。
 *   結果カメラ構図も `placement` から computeResultCamera で算出する(§5.3。金魚構図は完全再現)。
 * - 入力(INTERACTION_SPEC §3.4): クリック / Enter で「参道へ戻る」→ approach へ遷移する。
 * - 音響(発火のみ): 結果表示で result-success / result-fail を、確定で confirm を sfx:play で発火。
 *
 * 遷移オーナーの単一化: 「参道へ戻る」は本シーンの transition('approach') 一箇所に集約する。
 */
export class ResultScene implements Scene {
  readonly id = 'result' as const

  private readonly background: ApproachScene
  private readonly registry: StallRegistry

  /**
   * result 専用の固定カメラ(ART §5)。enter で stallId の placement から算出する(§5.3)。
   * background(ApproachScene)の world をこのカメラで描いて「屋台正面・店主中央」の構図にする。
   */
  private camera: PerspectiveCamera | null = null
  /** カメラ aspect の最新値(enter でカメラ再生成時に再適用する)。 */
  private aspect = 1

  private events: EventBus | null = null
  private input: InputManager | null = null
  private resultListener: ResultHudListener | null = null

  /** 現在の結果(enter の payload から確定)。表示と報酬反映に使う。 */
  private outcome: StallOutcome | null = null
  /** 二重遷移ガード(クリック/Enter が同フレームで複数経路から来ても 1 回だけ遷移する)。 */
  private returning = false

  /** キーボードのエッジ検出用(Enter/クリックを「押した瞬間」に 1 回だけ反応させる)。 */
  private prevEnterDown = false
  private prevMousePressed = false

  /**
   * @param background 背景に参道world(屋台・店主)を描くための ApproachScene 参照(render のみ使う)。
   * @param registry 屋台レジストリ(stallId→placement/resultRules を引く / D-010)。
   */
  constructor(background: ApproachScene, registry: StallRegistry) {
    this.background = background
    this.registry = registry
  }

  /** 合成点(App.tsx)から結果 HUD の購読者を注入する(EventBus を経由しない React 橋渡し)。 */
  setResultListener(listener: ResultHudListener): void {
    this.resultListener = listener
  }

  enter(ctx: SceneContext): void {
    this.events = ctx.events
    this.input = ctx.input
    this.returning = false

    // どの屋台の結果かを payload の stallId で確定し、その屋台の resultRules/placement を引く(§5)。
    const stallId = readStallId(ctx.payload)
    const def = this.registry.get(stallId ?? '')
    const result = readResult(ctx.payload)
    this.outcome = resolveStallResult(result, def.resultRules)

    // result 専用固定カメラを placement から算出する(§5.3。金魚の現行構図を完全再現)。
    this.camera = computeResultCamera(def.placement)
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()

    // 入力エッジ基準を現在状態へ揃える(minigame から入った直後の押下を「参道へ戻る」に誤検出しない)。
    this.prevEnterDown = ctx.input.isDown('Enter')
    this.prevMousePressed = ctx.input.mouse.pressed

    // 結果 HUD を出す(ui/Result が見出し・店主セリフ・報酬・「参道へ戻る」を描画)。
    this.resultListener?.({ active: true, outcome: this.outcome })

    // 結果表示時の効果音(発火のみ)。AUDIO_SPEC §4: 成功/大成功=result-success / 失敗=result-fail。
    const sfx = this.outcome.tier === 'fail' ? 'result-fail' : 'result-success'
    this.events?.emit('sfx:play', { name: sfx })
  }

  exit(): void {
    // 結果 HUD を閉じる(他HUDと排他のため、抜けたら非表示)。
    this.resultListener?.({ active: false, outcome: null })
    this.events = null
    this.input = null
    this.outcome = null
    this.camera = null
  }

  update(_dt: number): void {
    const input = this.input
    if (!input || this.returning) return

    // クリック / Enter の立ち上がりで「参道へ戻る」(INTERACTION_SPEC §3.4)。
    const enterEdge = this.justPressedEnter()
    const mousePressed = input.mouse.pressed
    const clicked = mousePressed && !this.prevMousePressed
    this.prevMousePressed = mousePressed

    if (enterEdge || clicked) {
      this.requestReturn()
    }
  }

  /**
   * 「参道へ戻る」要求(クリック/Enter のキーボード経路・本シーン経路、または ui/Result のボタン経路)。
   * 遷移オーナーを 1 箇所に集約し、二重遷移を防ぐ(returning ガード)。確定音 confirm を発火する。
   */
  requestReturn(): void {
    if (this.returning) return
    this.returning = true
    this.events?.emit('sfx:play', { name: 'confirm' })
    this.transition('approach')
  }

  /**
   * 背景に参道world(屋台・店主・提灯)を、result 専用固定カメラで描く(ART §5)。
   * world は ApproachScene 所有のまま renderWith で描く(二重生成しない)。alpha は固定構図のため未使用。
   */
  render(_alpha: number): void {
    if (this.camera) this.background.renderWith(this.camera)
  }

  resize(width: number, height: number): void {
    this.aspect = height > 0 ? width / height : 1
    if (this.camera) {
      this.camera.aspect = this.aspect
      this.camera.updateProjectionMatrix()
    }
  }

  // --- 内部 ---

  /** SceneManager への遷移を要求する(合成点で束縛した遷移ハンドラ経由 / DialogueScene と同方式)。 */
  private transition(to: 'approach'): void {
    this.transitionHandler?.(to)
  }

  private transitionHandler: ((to: 'approach') => void) | null = null

  /** App.tsx(合成点)から遷移ハンドラを注入する。 */
  setTransitionHandler(handler: (to: 'approach') => void): void {
    this.transitionHandler = handler
  }

  /** Enter キーの立ち上がり(前フレーム未押下→今フレーム押下)を検出する。 */
  private justPressedEnter(): boolean {
    const input = this.input
    if (!input) return false
    const key: GameKey = 'Enter'
    const down = input.isDown(key)
    const edge = down && !this.prevEnterDown
    this.prevEnterDown = down
    return edge
  }
}

/** enter の payload(unknown)から StallResult を安全に取り出す(なければ 0 点・破損)。 */
function readResult(payload: unknown): StallResult {
  if (payload && typeof payload === 'object' && 'result' in payload) {
    const r = (payload as { result: unknown }).result
    if (r && typeof r === 'object' && 'score' in r && 'reason' in r) {
      const score = (r as { score: unknown }).score
      const reason = (r as { reason: unknown }).reason
      if (
        typeof score === 'number' &&
        (reason === 'success' || reason === 'timeout' || reason === 'broke' || reason === 'quit')
      ) {
        return { score, reason }
      }
    }
  }
  return { score: 0, reason: 'broke' }
}
