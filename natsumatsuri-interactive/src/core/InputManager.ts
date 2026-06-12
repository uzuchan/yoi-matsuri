/** ゲームが追跡するキー(KeyboardEvent.code)。 */
export type GameKey =
  | 'KeyW'
  | 'KeyA'
  | 'KeyS'
  | 'KeyD'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'KeyE'
  | 'Space'
  | 'Escape'

export const GAME_KEYS: readonly GameKey[] = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyE',
  'Space',
  'Escape',
]

const TRACKED_KEYS: ReadonlySet<string> = new Set(GAME_KEYS)

/** マウス状態のスナップショット。 */
export interface MouseState {
  /** ビューポート座標(clientX/clientY)。 */
  x: number
  y: number
  /** 主ボタン(button 0)が押下中か。 */
  pressed: boolean
}

/**
 * attach先の最小インターフェース。windowが満たすほか、
 * node環境のunit testでは最小モック(addEventListener/removeEventListener実装)で代替できる。
 */
export interface InputEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void
  removeEventListener(type: string, listener: (event: Event) => void): void
}

/**
 * キーボード(WASD/矢印/E/Space/Esc)とマウス(移動/押下/解放)の現在状態を公開する。
 * イベント駆動ではなくポーリング前提(GameLoopのupdate内でisDown等を読む)。
 */
export class InputManager {
  private target: InputEventTarget | null = null
  private readonly pressedKeys = new Set<string>()
  private mouseX = 0
  private mouseY = 0
  private mousePressed = false

  /** 指定キーが押下中か。 */
  isDown(key: GameKey): boolean {
    return this.pressedKeys.has(key)
  }

  /** マウス状態のスナップショットを返す。 */
  get mouse(): MouseState {
    return { x: this.mouseX, y: this.mouseY, pressed: this.mousePressed }
  }

  /** イベントリスナーを登録する。既にattach済みなら付け替える。 */
  attach(target: InputEventTarget): void {
    if (this.target) this.detach()
    this.target = target
    target.addEventListener('keydown', this.handleKeyDown)
    target.addEventListener('keyup', this.handleKeyUp)
    target.addEventListener('mousemove', this.handleMouseMove)
    target.addEventListener('mousedown', this.handleMouseDown)
    target.addEventListener('mouseup', this.handleMouseUp)
    target.addEventListener('blur', this.handleBlur)
  }

  /** イベントリスナーを解除し、状態をリセットする。 */
  detach(): void {
    const target = this.target
    if (!target) return
    target.removeEventListener('keydown', this.handleKeyDown)
    target.removeEventListener('keyup', this.handleKeyUp)
    target.removeEventListener('mousemove', this.handleMouseMove)
    target.removeEventListener('mousedown', this.handleMouseDown)
    target.removeEventListener('mouseup', this.handleMouseUp)
    target.removeEventListener('blur', this.handleBlur)
    this.target = null
    this.reset()
  }

  private reset(): void {
    this.pressedKeys.clear()
    this.mousePressed = false
  }

  private readonly handleKeyDown = (event: Event): void => {
    const code = (event as KeyboardEvent).code
    if (TRACKED_KEYS.has(code)) this.pressedKeys.add(code)
  }

  private readonly handleKeyUp = (event: Event): void => {
    const code = (event as KeyboardEvent).code
    if (TRACKED_KEYS.has(code)) this.pressedKeys.delete(code)
  }

  private readonly handleMouseMove = (event: Event): void => {
    const mouseEvent = event as MouseEvent
    this.mouseX = mouseEvent.clientX
    this.mouseY = mouseEvent.clientY
  }

  private readonly handleMouseDown = (event: Event): void => {
    if ((event as MouseEvent).button === 0) this.mousePressed = true
  }

  private readonly handleMouseUp = (event: Event): void => {
    if ((event as MouseEvent).button === 0) this.mousePressed = false
  }

  /** フォーカス喪失時はキーが押しっぱなしにならないよう全解除する。 */
  private readonly handleBlur = (): void => {
    this.reset()
  }
}
