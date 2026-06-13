import type {
  DialogueController,
  DialogueOutcome,
  EventBus,
  GameKey,
  InputManager,
  Scene,
  SceneContext,
} from '../../core'
import type { ApproachScene } from '../approach/ApproachScene'

/**
 * 会話シーン(T-004 段A / D-008)。
 *
 * 設計(D-008):
 * - dialogue は SceneManager のシーン。独自の 3D 世界は作らない。
 * - 背景の参道world(屋台・店主・提灯)は、注入された ApproachScene の render を呼んで描画する
 *   (屋台が会話中も見える)。world の所有は ApproachScene のまま。プレイヤーは動かさない
 *   (このシーンは ApproachScene.update を呼ばないので、プレイヤー位置・カメラは会話中固定)。
 * - 会話の状態機械は three/react 非依存の純TS。具象 DialogueController は段B(gameplay-engineer)が
 *   game/dialogue に実装し、App.tsx の合成点で注入する。本シーンはそれを「駆動」するだけ。
 * - 会話ボックス・選択肢の描画は React HUD(ui/Dialogue, 段B)が担う。本シーンは表示状態の変化を
 *   'dialogue:view-changed' イベントで HUD へ橋渡しするのみ(SceneManager 状態と HUD の単一経路同期)。
 * - 入力2経路の集約(D-008): キーボード(送り/選択/Esc)は本シーンが InputManager をポーリングして
 *   DialogueController へ渡す。クリックは React オーバーレイ(段B)が直接 controller を呼ぶ。
 *
 * choice 後の遷移オーナーの単一化(REV-T-004-1 Major-2 対応):
 * - 選択確定(choice 結末)時、本シーンは 'dialogue:choice' を発火するだけで自身では遷移しない。
 *   choice に対する遷移(goldfish or approach)の決定権は App.tsx の 'dialogue:choice' 購読(routeChoice)に
 *   一元化する。これによりキーボード/マウス両経路で遷移オーナーが App 側の1つに揃い、
 *   「emit 後に自分でも transition して approach→approach の不正遷移を起こし try/catch で握り潰す」
 *   という例外をフロー制御化した脆い実装(REV-T-004-1 Major-2)を解消する。
 * - aborted(Esc 打ち切り)は dialogue→approach の正当な遷移なので、本シーンが直接 transition する。
 *   goldfish 未登録時の安全フォールバック(AC5)も App.routeChoice 側が担う(本シーンは関与しない)。
 */
export class DialogueScene implements Scene {
  readonly id = 'dialogue' as const

  private readonly background: ApproachScene
  private readonly controller: DialogueController

  private events: EventBus | null = null
  private input: InputManager | null = null

  /**
   * キーボードのエッジ検出用の前フレーム押下状態(InputManager は押下中=ホールドのみ公開する)。
   * 会話の送り/選択/Esc は「押した瞬間」に1回だけ反応させたいため、立ち上がりを自前で検出する。
   */
  private readonly prevDown: Record<GameKey, boolean> = createKeyState()
  /** マウス左ボタンのエッジ検出用(クリック=立ち上がりでセリフ送り)。 */
  private prevMousePressed = false

  /**
   * @param background 背景に参道worldを描くための ApproachScene 参照(render のみ使う)。
   * @param controller 会話の状態機械。段Bの具象を App.tsx で注入する。
   */
  constructor(background: ApproachScene, controller: DialogueController) {
    this.background = background
    this.controller = controller
  }

  enter(ctx: SceneContext): void {
    this.events = ctx.events
    this.input = ctx.input

    // エッジ検出の基準をリセット(approach から入った瞬間の E/クリックを送りに誤検出しない)。
    resetKeyState(this.prevDown)
    this.prevMousePressed = this.input.mouse.pressed

    this.controller.start()
    this.emitView()
  }

  exit(): void {
    this.events = null
    this.input = null
  }

  update(_dt: number): void {
    const input = this.input
    if (!input) return

    // 1文字送り(約30字/s)のタイピングを進める。
    this.controller.tick(_dt)

    // --- キーボードのエッジを集約(D-008: キーボード経路) ---
    // 全キーのエッジを毎フレーム無条件に評価する(justPressed は prevDown を更新する副作用を持つため、
    // 短絡評価で評価漏れを起こすと立ち上がり検出がずれる。先に全て確定させる)。
    const enterEdge = this.justPressed('Enter')
    const spaceEdge = this.justPressed('Space')
    const upPressed = this.justPressed('ArrowUp')
    const downPressed = this.justPressed('ArrowDown')
    const escPressed = this.justPressed('Escape')
    const advancePressed = enterEdge || spaceEdge

    // --- マウスのエッジ(クリック=セリフ送り。選択肢のクリック確定は HUD 側=段B が担う) ---
    const mousePressed = input.mouse.pressed
    const clicked = mousePressed && !this.prevMousePressed
    this.prevMousePressed = mousePressed

    let outcome: DialogueOutcome = { kind: 'continue' }

    // 操作フィードバック音(AC7 / INTERACTION_SPEC §3.2)。マウス経路(ui/Dialogue)と音・条件を揃え、
    // 同じ操作なら入力デバイスに関わらず同一の sfx:play を発火する(§1-2: フィードバックの入力経路非依存)。
    // - セリフ送り(advance) → 'dialogue-next'
    // - 選択フォーカス移動(focusedChoiceIndex が実際に変化した時のみ) → 'select'
    // - 選択確定(confirm) → 'confirm'
    // Esc 打ち切りは仕様表に効果音がないため無音(ui/Dialogue も Esc 音は出さない)。
    if (escPressed) {
      outcome = this.controller.abort()
    } else {
      const viewBefore = this.controller.view()
      if (viewBefore.choices.length > 0) {
        // 選択肢表示中: ↑↓ でフォーカス移動、Enter/Space で確定。
        if (upPressed) this.controller.moveFocus(-1)
        if (downPressed) this.controller.moveFocus(1)
        // フォーカスが実際に動いた時だけ select を鳴らす(ui/Dialogue の「同一indexなら鳴らさない」と一貫)。
        if (upPressed || downPressed) {
          const focusAfter = this.controller.view().focusedChoiceIndex
          if (focusAfter !== viewBefore.focusedChoiceIndex) {
            this.events?.emit('sfx:play', { name: 'select' })
          }
        }
        if (advancePressed) {
          outcome = this.controller.confirm()
          this.events?.emit('sfx:play', { name: 'confirm' })
        }
      } else {
        // セリフ送り中: Enter/Space/クリックで送り。
        if (advancePressed || clicked) {
          outcome = this.controller.advance()
          this.events?.emit('sfx:play', { name: 'dialogue-next' })
        }
      }
    }

    // 表示状態が変わっていれば HUD へ通知する。
    this.emitViewIfChanged()

    // 結末(選択確定 / 打ち切り)に応じてシーン遷移を要求する。
    this.handleOutcome(outcome)
  }

  /**
   * 背景に参道world(屋台・店主・提灯)を描く。ApproachScene.update は呼ばないので
   * プレイヤー移動・カメラ追従は会話中停止する(屋台が固定で見え続ける = AC2)。
   */
  render(alpha: number): void {
    this.background.render(alpha)
  }

  resize(width: number, height: number): void {
    this.background.resize?.(width, height)
  }

  // --- 内部 ---

  /**
   * 結末を解釈してシーン遷移を要求する。'continue' は何もしない。
   * - choice: 'dialogue:choice' を発火するのみ(遷移は App.routeChoice が単一オーナーとして決める)。
   *   本シーンは choice では transition しない(REV-T-004-1 Major-2: 二重遷移・例外フロー化の解消)。
   * - aborted: dialogue→approach の正当な遷移なので本シーンが直接 transition する(Esc 打ち切り)。
   */
  private handleOutcome(outcome: DialogueOutcome): void {
    if (outcome.kind === 'continue') return

    if (outcome.kind === 'aborted') {
      this.transition('approach')
      return
    }

    // outcome.kind === 'choice'
    // 遷移先(goldfish or approach、未登録フォールバック含む)は App.routeChoice が一元決定する。
    // ここで transition すると二重遷移になるため発火のみに留める(遷移オーナーの単一化)。
    this.events?.emit('dialogue:choice', { choiceId: outcome.choiceId })
  }

  /**
   * SceneManager への遷移を要求する。Scene は SceneManager を直接参照しない core 設計のため
   * (SceneContext は SceneManager を公開しない)、App.tsx の合成点で束縛された遷移ハンドラ経由で行う。
   */
  private transition(to: 'approach' | 'goldfish'): void {
    this.transitionHandler?.(to)
  }

  /**
   * シーン遷移ハンドラ。App.tsx(合成点)が SceneManager.transition を束縛して注入する。
   */
  private transitionHandler: ((to: 'approach' | 'goldfish') => void) | null = null

  /** App.tsx(合成点)から遷移ハンドラを注入する。 */
  setTransitionHandler(handler: (to: 'approach' | 'goldfish') => void): void {
    this.transitionHandler = handler
  }

  /** キーの立ち上がり(前フレーム未押下→今フレーム押下)を検出する。 */
  private justPressed(key: GameKey): boolean {
    const input = this.input
    if (!input) return false
    const down = input.isDown(key)
    const edge = down && !this.prevDown[key]
    this.prevDown[key] = down
    return edge
  }

  /** 現在の表示状態を HUD へ無条件で発火する。 */
  private emitView(): void {
    this.events?.emit('dialogue:view-changed', { view: this.controller.view() })
    this.lastViewSignature = signature(this.controller.view())
  }

  /** 表示状態が前回発火時から変化していれば HUD へ発火する(無駄な再描画を抑える)。 */
  private emitViewIfChanged(): void {
    const view = this.controller.view()
    const sig = signature(view)
    if (sig !== this.lastViewSignature) {
      this.lastViewSignature = sig
      this.events?.emit('dialogue:view-changed', { view })
    }
  }

  /** 直近に HUD へ発火した表示状態の軽量シグネチャ。 */
  private lastViewSignature = ''
}

// --- ヘルパ(モジュール内) ---

function createKeyState(): Record<GameKey, boolean> {
  return {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    KeyE: false,
    Space: false,
    Enter: false,
    Escape: false,
  }
}

function resetKeyState(state: Record<GameKey, boolean>): void {
  for (const key of Object.keys(state) as GameKey[]) {
    state[key] = false
  }
}

/** 表示状態の変化検出用の軽量シグネチャ。view が変われば文字列も変わる。 */
function signature(view: {
  visibleText: string
  typing: boolean
  focusedChoiceIndex: number
  active: boolean
  choices: readonly { id: string }[]
}): string {
  const choiceIds = view.choices.map((c) => c.id).join(',')
  return `${view.active ? 1 : 0}|${view.typing ? 1 : 0}|${view.focusedChoiceIndex}|${choiceIds}|${view.visibleText}`
}
