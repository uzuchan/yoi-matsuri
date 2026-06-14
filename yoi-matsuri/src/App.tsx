import { useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, WebGLRenderer } from 'three'
import {
  EventBus,
  GameLoop,
  InputManager,
  SceneManager,
  type DialogueController,
} from './core'
import { ApproachScene } from './scenes/approach/ApproachScene'
import { DialogueScene } from './scenes/dialogue/DialogueScene'
import { ResultScene, type ResultHudState } from './scenes/result/ResultScene'
import { MinigameScene, type StallHudState } from './scenes/stall'
import { createStallRegistry } from './scenes/stall/definitions'
import { resolveStallResult } from './game/result'
import type { RewardInfo } from './game/result'
import { createGenericStallDialogue } from './game/dialogue'
import { AudioEngine } from './audio'
import { HudRoot } from './ui/HudRoot'

interface DebugStats {
  fps: number
  drawCalls: number
}

const DEBUG_STATS_INTERVAL_MS = 200

function isDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

/**
 * App の props。合成点(下記)では機能オーナーが具象 DialogueController を注入できるよう
 * controller を prop で受ける(D-008 後方互換)。
 */
export interface AppProps {
  /**
   * 既定の会話の状態機械(後方互換)。StallFramework 移行(D-010)後は、各屋台の会話は
   * StallDefinition.createDialogue(or 汎用フォールバック)から供給されるため通常は未注入(null)でよい。
   * 注入されたときは、Definition が会話を持たない屋台の既定 controller として使う余地を残す。
   */
  controller?: DialogueController | null
}

/**
 * ゲームシェル兼「合成点」(D-008 / StallFramework §2.4・D-010)。
 *
 * 全画面canvasにWebGLRendererをマウントし、GameLoop + SceneManager を起動するReactルート。
 * canvas の上に React HUD(HudRoot)を重ねる。?debug=1 のときのみFPS/draw callオーバーレイを表示する。
 *
 * 合成点としての責務(StallFramework §2.4): StallRegistry を回して屋台を自動配線する。
 * - 固定4種のシーン(approach / dialogue / minigame / result)を1つずつ SceneManager に登録する。
 * - dialogue は stallId→controller を解決(Definition.createDialogue ?? 汎用フォールバック)。
 * - minigame は MinigameScene が stallId で該当 StallScene へ委譲(Registry 駆動 / §3.2)。
 * - result は registry の resultRules/placement で結果・カメラを解決(§5)。
 * - approach 近接 → dialogue(stallId)→ minigame(stallId)→ result(stallId)→ approach の遷移で
 *   stallId をペイロードで引き回す(§4.4)。報酬付与は result→approach の瞬間に resultRules で解決する。
 */
export default function App({ controller = null }: AppProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // HudRoot に渡す EventBus を state で保持し、useEffect 初期化後に確定させる。
  const [eventBus, setEventBus] = useState<EventBus | null>(null)
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null)
  // 屋台ミニゲーム HUD 状態(StallScene 由来。EventBus 非経由で React 橋渡し)。
  const [stallHud, setStallHud] = useState<StallHudState | null>(null)
  // アクティブ会話 controller(DialogueScene が enter で解決。クリック入力の集約先 / D-008)。
  const [activeController, setActiveController] = useState<DialogueController | null>(null)
  // 結果 HUD 状態(ResultScene 由来。EventBus 非経由で React 橋渡し)。
  const [resultHud, setResultHud] = useState<ResultHudState | null>(null)
  // 所持品(獲得報酬の蓄積。表示のみ・使用機能なしだが実動作で積み上がる)。
  const [inventory, setInventory] = useState<RewardInfo[]>([])
  // 所持品フライイン演出のトリガー(報酬追加ごとに +1)。
  const [inventoryFlyToken, setInventoryFlyToken] = useState(0)
  // 「参道へ戻る」のマウス経路を ResultScene.requestReturn へ集約するためのハンドル。
  const requestResultReturnRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    // ART_DIRECTION §4: トーンマッピング
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1

    const events = new EventBus()
    setEventBus(events)
    const input = new InputManager()
    input.attach(window)

    // --- 音響(合成点) ---
    const audio = new AudioEngine()
    audio.install(events)

    // --- 屋台レジストリ(StallFramework §2.3・§2.4) ---
    // 全 StallDefinition を登録する。合成点はこれを回して屋台を自動配線し、屋台名のハードコードを持たない。
    const registry = createStallRegistry()

    const approachScene = new ApproachScene(renderer)
    // 近接判定を全屋台 placement へ一般化する(§4.2)。Definition から placement を渡す。
    approachScene.setStallPlacements(
      registry.getAll().map((def) => ({
        stallId: def.id,
        displayName: def.displayName,
        placement: def.placement,
      })),
    )

    const scenes = new SceneManager(events, input)
    scenes.register(approachScene)

    // --- 屋台ミニゲーム(汎用 MinigameScene)。stallId で該当 StallScene へ委譲(§3.2) ---
    const minigameScene = new MinigameScene(renderer, registry)
    minigameScene.setHudListener((state) => setStallHud(state))
    scenes.register(minigameScene)

    // --- 結果シーン。registry の resultRules/placement で結果・カメラを解決(§5) ---
    const resultScene = new ResultScene(approachScene, registry)
    resultScene.setResultListener((state) => setResultHud(state))
    resultScene.setTransitionHandler((to) => scenes.transition(to))
    scenes.register(resultScene)
    requestResultReturnRef.current = () => resultScene.requestReturn()

    // --- 会話シーン。stallId→controller を解決(Definition.createDialogue ?? 汎用フォールバック / §2.5) ---
    // 屋台ごとの controller を生成・キャッシュし、stallId で引く(会話状態は再入場で start() し直す)。
    const controllerByStall = new Map<string, DialogueController>()
    const resolveController = (stallId: string): DialogueController => {
      let ctrl = controllerByStall.get(stallId)
      if (!ctrl) {
        const def = registry.get(stallId)
        ctrl = def.createDialogue?.() ?? createGenericStallDialogue(def.displayName)
        controllerByStall.set(stallId, ctrl)
      }
      return ctrl
    }
    // DialogueScene には既定 controller(後方互換)を渡しつつ、resolver で stallId 解決を優先する。
    const defaultController = controller ?? createGenericStallDialogue('屋台')
    const dialogueScene = new DialogueScene(approachScene, defaultController)
    dialogueScene.setControllerResolver(resolveController)
    dialogueScene.setActiveControllerListener((ctrl) => setActiveController(ctrl))
    dialogueScene.setTransitionHandler((to) => scenes.transition(to))
    scenes.register(dialogueScene)

    // ApproachScene の「近接中 E/左クリック → 会話」配線(stallId を payload で運ぶ / §4.4)。
    approachScene.setTransitionHandler((to, payload) => scenes.transition(to, payload))

    // 会話の選択確定(choiceId)に応じた遷移の単一オーナー(合成点)。
    // 'play' → minigame(現在の屋台 stallId を引き継ぐ)。それ以外 → approach。
    const routeChoice = (choiceId: string): void => {
      if (scenes.current !== 'dialogue') return
      if (choiceId === 'play') {
        const stallId = dialogueScene.currentStallId
        if (stallId !== null) scenes.transition('minigame', { stallId })
        else scenes.transition('approach')
        return
      }
      scenes.transition('approach')
    }
    const unsubscribeChoice = events.on('dialogue:choice', ({ choiceId }) => routeChoice(choiceId))

    // --- 通しループの結線: stall:finished → result(D-010) ---
    // ミニゲーム終了で result へ遷移し、payload で stallId と StallResult を渡す。
    const unsubscribeFinished = events.on('stall:finished', ({ stallId, result }) => {
      if (scenes.current === 'minigame') scenes.transition('result', { stallId, result })
    })

    // 結果の報酬を所持品へ反映する。「参道へ戻る」(result→approach)の瞬間に 1 回だけ積み、
    // フライイン演出を起こす(scene:transition の result→approach を単一の付与ポイントにする = 二重付与なし)。
    // 報酬は直近の結果(stallId + StallResult)から resultRules で確定する(§5)。
    let pendingReward: RewardInfo | null = null
    const unsubscribeReward = events.on('stall:finished', ({ stallId, result }) => {
      const rules = registry.get(stallId).resultRules
      pendingReward = resolveStallResult(result, rules).reward
    })
    const unsubscribeGrant = events.on('scene:transition', ({ from, to }) => {
      if (from === 'result' && to === 'approach' && pendingReward) {
        const reward = pendingReward
        pendingReward = null
        setInventory((prev) => [...prev, reward])
        setInventoryFlyToken((n) => n + 1)
      }
    })

    scenes.start('approach')

    const loop = new GameLoop()
    loop.onUpdate((dt) => scenes.update(dt))
    loop.onRender((alpha) => scenes.render(alpha))
    loop.start()

    const handleResize = (): void => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      scenes.resize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    let statsTimer = 0
    if (isDebugEnabled()) {
      statsTimer = window.setInterval(() => {
        setDebugStats({
          fps: loop.fps,
          drawCalls: renderer.info.render.calls,
        })
      }, DEBUG_STATS_INTERVAL_MS)
    }

    return () => {
      if (statsTimer !== 0) window.clearInterval(statsTimer)
      window.removeEventListener('resize', handleResize)
      unsubscribeChoice()
      unsubscribeFinished()
      unsubscribeReward()
      unsubscribeGrant()
      requestResultReturnRef.current = null
      loop.stop()
      input.detach()
      audio.dispose()
      approachScene.dispose()
      // MinigameScene は exit で屋台 Scene を dispose する。明示的にアクティブ屋台があれば exit で解放。
      renderer.dispose()
      setEventBus(null)
      setStallHud(null)
      setResultHud(null)
      setActiveController(null)
    }
  }, [controller])

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      {/* React HUD オーバーレイ(D-008)。会話/ミニゲーム/結果/所持品のオーバーレイをマウントする枠。 */}
      {eventBus !== null && (
        <HudRoot
          events={eventBus}
          controller={activeController}
          stallHud={stallHud}
          resultHud={resultHud}
          onResultReturn={() => requestResultReturnRef.current?.()}
          inventory={inventory}
          inventoryFlyToken={inventoryFlyToken}
        />
      )}
      {debugStats !== null && (
        <div className="debug-overlay" role="status">
          <span>FPS {debugStats.fps.toFixed(1)}</span>
          <span>draw calls {debugStats.drawCalls}</span>
        </div>
      )}
    </>
  )
}
