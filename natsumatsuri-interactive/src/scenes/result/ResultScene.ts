import { PerspectiveCamera, Vector3 } from 'three'
import type { EventBus, GameKey, InputManager, Scene, SceneContext } from '../../core'
import type { ApproachScene } from '../approach/ApproachScene'
import { resolveResult, type ResultOutcome, type ResultReason } from '../../game/result'
import { STALL_POSITION } from '../../world'

/**
 * 結果表示の HUD 状態(React へ橋渡しする純データ)。
 *
 * 金魚 HUD(T-006)と同様、EventBus を経由しない: GameEvents 型(core/EventBus.ts)は本タスクで
 * 変更禁止のため新しいイベント型を足さず、合成点(App.tsx)が setResultListener で直接 React state へ
 * 橋渡しする(会話/金魚 HUD と排他で表示する)。
 */
export interface ResultHudState {
  /** 結果オーバーレイを表示するか(result シーン中=true、抜けたら false で他HUDと排他)。 */
  readonly active: boolean
  /** 段・見出し・店主セリフ・報酬(GDD §3.2)。active=false のときは null。 */
  readonly outcome: ResultOutcome | null
}

/** 結果 HUD 状態の購読者(合成点が React state へ橋渡し)。 */
export type ResultHudListener = (state: ResultHudState) => void

/** goldfish:finished の payload 形(T-006 引き継ぎ)。ResultScene が enter の payload で受ける。 */
interface ResultPayload {
  caught: number
  reason: ResultReason
}

// --- result 専用固定カメラ(ART §5 result の裁定数値 / REV-T-007-1 Major-2)---
// approach の追従カメラ(後方5m・高3.2m・俯角15°・FOV55°)とは別インスタンス。result 中のみ使用。
// 屋台の正面(参道側=approach でプレイヤーが屋台に対面した向き)から店主頭部を見る固定構図。
//
// 座標系の確認(world/stall.ts / world/lighting.ts):
//   - 屋台 group は STALL_POSITION(x:5,z:-26)に置かれ rotation.y=-90°。
//   - 店主は world ≈ (4.5, _, -25.7)、裸電球2個は world ≈ (5,2.1,-26.9)/(5,2.1,-25.1)。
//   - approach のプロンプト/プレイヤーは参道中心側(-x)から屋台へ対面する(prompt が STALL_x-1.2=3.8)。
//   - 屋台 PointLight(§7-4 屋台前を最も明るく)は world ≈ (4, _, -26)=屋台中心の -x 側に置かれる。
// よって ART §5「正面=参道側=プレイヤーが屋台に対面した向き」かつ「屋台前(裸電球)が最も明るい」
// (§7-4)を同時に満たす視点は屋台中心の -x 方向。カメラは -x 側へ水平距離 4.5m・高さ 1.8m に置き、
// 屋台 PointLight をカメラと店主の間に挟んで店主前面を順光で照らす。注視点は屋台中心 +y1.5(店主頭部)。
const RESULT_CAMERA_FOV = 50 // ART §5: 50°
const RESULT_CAMERA_DISTANCE = 4.5 // ART §5: 屋台中心へ水平距離 4.5m(正面=参道側=-x 側)
const RESULT_CAMERA_HEIGHT = 1.8 // ART §5: 高さ 1.8m
const RESULT_LOOK_HEIGHT = 1.5 // ART §5: 注視点 = 屋台中心 +y1.5(店主頭部)。STALL_POSITION.y=0。
const RESULT_CAMERA_NEAR = 0.1
const RESULT_CAMERA_FAR = 400

/**
 * 結果シーン(T-007 / GDD §3.2・INTERACTION_SPEC §3.4・D-008)。
 *
 * 設計(DialogueScene / D-008 を踏襲):
 * - result は SceneManager のシーン。独自の 3D 世界は作らず、注入された ApproachScene の render を
 *   呼んで背景の参道world(屋台・店主・提灯)を描画する(屋台が結果表示中も見える / AC6)。
 *   world の所有は ApproachScene のまま。プレイヤー・カメラは固定(ApproachScene.update を呼ばない)。
 * - 確保数(secured = finished.caught)から game/result の resolveResult で段・見出し・店主セリフ・
 *   報酬を確定し、setResultListener 経由で React HUD(ui/Result)へ橋渡しする(EventBus 非経由)。
 * - 入力(INTERACTION_SPEC §3.4): クリック / Enter で「参道へ戻る」→ approach へ遷移する。
 *   マウスのみ・キーボードのみ両方で進められる(§1原則)。クリックの確定は ui/Result が
 *   ボタンで受けても、本シーンが InputManager で受けても、どちらも approach へ戻れる。
 * - 音響(発火のみ、音は T-008): 結果表示時に result-success / result-fail を、確定で confirm を
 *   sfx:play で発火する(AUDIO_SPEC §4)。
 *
 * 遷移オーナーの単一化(DialogueScene の routeChoice と同方針):
 * - 「参道へ戻る」の遷移は本シーンと ui/Result の両経路から呼ばれうるが、いずれも本シーンの
 *   transition('approach') 一箇所に集約する(ui/Result は確定エッジを本シーンへ knock する形ではなく、
 *   confirm の sfx と「戻る」要求を events 経由ではなく直接 onReturn コールバックで本シーンへ渡す)。
 */
export class ResultScene implements Scene {
  readonly id = 'result' as const

  private readonly background: ApproachScene

  /**
   * result 専用の固定カメラ(ART §5)。background(ApproachScene)の world を、approach の追従カメラ
   * ではなくこのカメラで描いて「屋台正面・店主中央」の構図にする。world は ApproachScene 所有のまま
   * (二重生成しない / 性能予算 §6 を増やさない)。result 中は動かさない(追従・揺れなし)。
   */
  private readonly camera: PerspectiveCamera

  private events: EventBus | null = null
  private input: InputManager | null = null
  private resultListener: ResultHudListener | null = null

  /** 現在の結果(enter の payload から確定)。表示と報酬反映に使う。 */
  private outcome: ResultOutcome | null = null
  /** 二重遷移ガード(クリック/Enter が同フレームで複数経路から来ても 1 回だけ遷移する)。 */
  private returning = false

  /** キーボードのエッジ検出用(Enter/クリックを「押した瞬間」に 1 回だけ反応させる)。 */
  private prevEnterDown = false
  private prevMousePressed = false

  /**
   * @param background 背景に参道world(屋台・店主)を描くための ApproachScene 参照(render のみ使う)。
   */
  constructor(background: ApproachScene) {
    this.background = background

    // result 専用固定カメラを構築する(ART §5 数値)。aspect は最初の resize で正しく更新される。
    this.camera = new PerspectiveCamera(
      RESULT_CAMERA_FOV,
      1,
      RESULT_CAMERA_NEAR,
      RESULT_CAMERA_FAR,
    )
    // 屋台正面(参道側=-x)の固定位置へ。注視点は屋台中心 +y1.5(店主頭部)。
    this.camera.position.set(
      STALL_POSITION.x - RESULT_CAMERA_DISTANCE,
      RESULT_CAMERA_HEIGHT,
      STALL_POSITION.z,
    )
    this.camera.lookAt(new Vector3(STALL_POSITION.x, RESULT_LOOK_HEIGHT, STALL_POSITION.z))
  }

  /** 合成点(App.tsx)から結果 HUD の購読者を注入する(EventBus を経由しない React 橋渡し)。 */
  setResultListener(listener: ResultHudListener): void {
    this.resultListener = listener
  }

  enter(ctx: SceneContext): void {
    this.events = ctx.events
    this.input = ctx.input
    this.returning = false

    // 確保数(secured)と終了理由(reason)を payload から取り出し、段・見出し・店主セリフ・報酬を
    // 確定する(GDD §3.2 v1.2)。失敗段(0匹)は reason で見出し・セリフが分岐する(torn/timeout/quit)。
    const caught = readCaught(ctx.payload)
    const reason = readReason(ctx.payload)
    this.outcome = resolveResult(caught, reason)

    // 入力エッジ基準を現在状態へ揃える(goldfish から入った直後の押下を「参道へ戻る」に誤検出しない)。
    this.prevEnterDown = ctx.input.isDown('Enter')
    this.prevMousePressed = ctx.input.mouse.pressed

    // 結果 HUD を出す(ui/Result が見出し・店主セリフ・報酬・「参道へ戻る」を描画)。
    this.resultListener?.({ active: true, outcome: this.outcome })

    // 結果表示時の効果音(発火のみ。音は T-008)。AUDIO_SPEC §4: 成功/大成功=result-success / 失敗=result-fail。
    const sfx = this.outcome.tier === 'fail' ? 'result-fail' : 'result-success'
    this.events?.emit('sfx:play', { name: sfx })
  }

  exit(): void {
    // 結果 HUD を閉じる(他HUDと排他のため、抜けたら非表示)。
    this.resultListener?.({ active: false, outcome: null })
    this.events = null
    this.input = null
    this.outcome = null
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
    // 確定フィードバック音(発火のみ。音は T-008)。AUDIO_SPEC §4: confirm。
    this.events?.emit('sfx:play', { name: 'confirm' })
    this.transition('approach')
  }

  /**
   * 背景に参道world(屋台・店主・提灯)を、result 専用固定カメラで描く(ART §5 / Major-2)。
   * ApproachScene.update / approach 追従カメラは使わない(プレイヤー移動・カメラ追従は停止)。
   * これで「屋台正面・店主中央」の構図になり、屋台が固定で見え続ける(AC6)。world は
   * ApproachScene 所有のまま renderWith で描く(二重生成しない)。alpha は固定構図のため未使用。
   */
  render(_alpha: number): void {
    this.background.renderWith(this.camera)
  }

  resize(width: number, height: number): void {
    // result 専用カメラの aspect を更新する(approach 側カメラは触らない)。
    this.camera.aspect = height > 0 ? width / height : 1
    this.camera.updateProjectionMatrix()
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

/** enter の payload(unknown)から確保数(secured)を安全に取り出す。 */
function readCaught(payload: unknown): number {
  if (payload && typeof payload === 'object' && 'caught' in payload) {
    const v = (payload as ResultPayload).caught
    if (typeof v === 'number') return v
  }
  return 0
}

/**
 * enter の payload(unknown)から終了理由(reason)を安全に取り出す(GDD §3.2 v1.2)。
 * 未指定/不正値は破損(torn)へ丸める(resolveResult の既定と一致)。
 */
function readReason(payload: unknown): ResultReason {
  if (payload && typeof payload === 'object' && 'reason' in payload) {
    const v = (payload as ResultPayload).reason
    if (v === 'torn' || v === 'timeout' || v === 'quit') return v
  }
  return 'torn'
}
