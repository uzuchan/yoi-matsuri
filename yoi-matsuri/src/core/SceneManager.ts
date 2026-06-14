import type { EventBus } from './EventBus'
import type { InputManager } from './InputManager'

/**
 * 全シーンID(TECHNICAL_ARCHITECTURE §3 / D-010)。
 *
 * 屋台数に依存しない固定4種。'goldfish' は汎用 'minigame' へ集約され、「どの屋台か」は
 * 遷移 payload の stallId が運ぶ(StallFramework §3.2)。これにより ALLOWED_TRANSITIONS の
 * 網羅チェック(不正遷移 throw = D-006 の価値)を保ったまま屋台を無限に追加できる。
 */
export type SceneId = 'approach' | 'dialogue' | 'minigame' | 'result'

/** Scene.enter に渡されるコンテキスト。シーンはここからcore APIへアクセスする。 */
export interface SceneContext {
  events: EventBus
  input: InputManager
  /** transition(to, payload) で渡された任意データ。 */
  payload?: unknown
}

/** 全シーンが実装するインターフェース(TECHNICAL_ARCHITECTURE §3)。 */
export interface Scene {
  readonly id: SceneId
  enter(ctx: SceneContext): void
  exit(): void
  update(dt: number): void
  render(alpha: number): void
  /** ビューポートサイズ変更時に呼ばれる(任意実装)。 */
  resize?(width: number, height: number): void
}

/**
 * 許可遷移表(D-010 再設計)。ここにない遷移は不正としてthrowする。
 * approach(参道) → dialogue(会話) → minigame(屋台ミニゲーム) → result(結果) → approach
 * 会話からは参道へ戻ることもできる(誘いを断る)。
 * 屋台が何軒でも遷移表は4状態のまま。「どの屋台か」は payload の stallId が運ぶ(§3.4)。
 */
const ALLOWED_TRANSITIONS: Readonly<Record<SceneId, readonly SceneId[]>> = {
  approach: ['dialogue'],
  dialogue: ['approach', 'minigame'], // 旧 'goldfish' → 'minigame'
  minigame: ['result'], // 屋台ミニゲーム終了は必ず result 経由
  result: ['approach'],
}

/**
 * シーン状態機械。登録されたSceneのenter/exit/update/renderのライフサイクルを管理し、
 * 遷移時に 'scene:transition' イベントをEventBusへ発火する。
 */
export class SceneManager {
  private readonly scenes = new Map<SceneId, Scene>()
  private readonly events: EventBus
  private readonly input: InputManager
  private active: Scene | null = null

  constructor(events: EventBus, input: InputManager) {
    this.events = events
    this.input = input
  }

  /** 現在のシーンID。start前に参照するとthrow。 */
  get current(): SceneId {
    if (!this.active) {
      throw new Error('SceneManager: アクティブなシーンがありません。先に start() を呼んでください')
    }
    return this.active.id
  }

  register(scene: Scene): void {
    if (this.scenes.has(scene.id)) {
      throw new Error(`SceneManager: シーン "${scene.id}" は登録済みです`)
    }
    this.scenes.set(scene.id, scene)
  }

  /** 最初のシーンを開始する。2回目以降の呼び出しはthrow。 */
  start(id: SceneId, payload?: unknown): void {
    if (this.active) {
      throw new Error(`SceneManager: すでに "${this.active.id}" で開始済みです`)
    }
    const scene = this.requireScene(id)
    this.active = scene
    scene.enter(this.createContext(payload))
  }

  /** シーンを遷移する。許可遷移表にない遷移・未登録シーンへの遷移はthrow。 */
  transition(to: SceneId, payload?: unknown): void {
    if (!this.active) {
      throw new Error('SceneManager: start() 前に transition() は呼べません')
    }
    const from = this.active.id
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new Error(`SceneManager: 不正な遷移です "${from}" → "${to}"`)
    }
    const next = this.requireScene(to)
    this.active.exit()
    this.active = next
    next.enter(this.createContext(payload))
    this.events.emit('scene:transition', { from, to })
  }

  /** アクティブシーンへ固定タイムステップ更新を委譲する。 */
  update(dt: number): void {
    this.active?.update(dt)
  }

  /** アクティブシーンへ描画を委譲する。 */
  render(alpha: number): void {
    this.active?.render(alpha)
  }

  /** アクティブシーンへリサイズを委譲する。 */
  resize(width: number, height: number): void {
    this.active?.resize?.(width, height)
  }

  private requireScene(id: SceneId): Scene {
    const scene = this.scenes.get(id)
    if (!scene) {
      throw new Error(`SceneManager: シーン "${id}" は未登録です`)
    }
    return scene
  }

  private createContext(payload?: unknown): SceneContext {
    return { events: this.events, input: this.input, payload }
  }
}
