import type { WebGLRenderer } from 'three'
import type { Scene, SceneContext } from '../../core'
import type { StallRegistry } from './registry'
import type { StallScene, StallHudState } from './types'

/**
 * 汎用 minigame ディスパッチャ(STALL_FRAMEWORK §3.2 / D-010)。
 *
 * SceneManager には 'minigame' として1つだけ登録される。enter payload の stallId を見て
 * Registry から該当屋台の StallScene を引き、enter/update/render/exit/resize を委譲する薄い殻。
 *
 * 性能(§7): アクティブな StallScene は常に1つだけ enter され、その three シーンだけ render される。
 * 屋台 Scene は遅延生成(enter で初めて createScene、exit で dispose)し、歩行中は屋台中身を持たない
 * (常駐コスト最小・dispose 漏れ防止 = §7 Risk 4)。HUD 状態は active な StallScene から listener で
 * 橋渡しし、exit で null を流して HudRoot 側を閉じる。
 */
export class MinigameScene implements Scene {
  readonly id = 'minigame' as const

  private readonly renderer: WebGLRenderer
  private readonly registry: StallRegistry
  /** HUD 状態の購読者(合成点が注入。EventBus を経由しない React 橋渡し)。 */
  private hudListener: ((state: StallHudState | null) => void) | null = null

  /** 現在アクティブな屋台 Scene(enter で生成、exit で dispose)。 */
  private active: StallScene | null = null
  /** アクティブ屋台の id(payload から確定)。 */
  private activeStallId: string | null = null

  constructor(renderer: WebGLRenderer, registry: StallRegistry) {
    this.renderer = renderer
    this.registry = registry
  }

  /** 合成点(App.tsx)から HUD 購読者を注入する。 */
  setHudListener(listener: (state: StallHudState | null) => void): void {
    this.hudListener = listener
  }

  enter(ctx: SceneContext): void {
    const stallId = readStallId(ctx.payload)
    if (stallId === null) {
      throw new Error('MinigameScene: enter payload に stallId がありません')
    }
    const def = this.registry.get(stallId)
    this.activeStallId = stallId

    // 遅延生成(§7): enter で初めて該当屋台の StallScene を生成する。
    const scene = def.createScene(this.renderer)
    scene.setHudListener((state) => this.hudListener?.(state))
    this.active = scene
    scene.enter(ctx)
  }

  update(dt: number): void {
    this.active?.update(dt)
  }

  render(alpha: number): void {
    this.active?.render(alpha)
  }

  resize(width: number, height: number): void {
    this.active?.resize?.(width, height)
  }

  exit(): void {
    // 屋台 Scene の HUD を閉じてから dispose(歩行中は屋台中身を持たない / 性能予算)。
    this.active?.exit()
    this.active?.dispose()
    this.active = null
    this.activeStallId = null
    this.hudListener?.(null)
  }

  /** 現在アクティブな屋台 id(テスト/デバッグ用)。 */
  get currentStallId(): string | null {
    return this.activeStallId
  }
}

/** enter の payload(unknown)から stallId を安全に取り出す(なければ null)。 */
export function readStallId(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'stallId' in payload) {
    const v = (payload as { stallId: unknown }).stallId
    if (typeof v === 'string') return v
  }
  return null
}
