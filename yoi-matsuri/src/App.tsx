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
import { GoldfishScene, type GoldfishHudState } from './scenes/goldfish/GoldfishScene'
import { ResultScene, type ResultHudState } from './scenes/result/ResultScene'
import { resolveResult, type RewardInfo } from './game/result'
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
 * App の props。合成点(下記)では機能オーナー(段B = gameplay-engineer)が
 * 具象 DialogueController を注入できるよう、controller を prop で受ける(D-008)。
 */
export interface AppProps {
  /**
   * 会話の状態機械(段Bの具象 = game/dialogue)。注入されたときだけ会話シーンを登録・配線する。
   * 段A(基盤)では未注入(null)で、ApproachScene のみが描画される(ダミー会話を作らない)。
   * 段B結線: main.tsx で `createGoldfishStallDialogue()` 等の具象を生成し <App controller={...} /> へ渡す。
   */
  controller?: DialogueController | null
}

/**
 * ゲームシェル兼「合成点」(D-008)。
 * 全画面canvasにWebGLRendererをマウントし、GameLoop + SceneManager を起動するReactルート。
 * canvas の上に React HUD(HudRoot)を重ねる。?debug=1 のときのみFPS/draw callオーバーレイを表示する。
 *
 * 合成点としての責務(機能オーナーが編集しうる箇所):
 * - シーンの生成・登録(ApproachScene / DialogueScene / GoldfishScene / ResultScene)
 * - 各シーンへの依存注入: ApproachScene 参照(背景描画)・具象 DialogueController・遷移ハンドラ・HUD 橋渡し
 * - 通しループの結線(T-007): goldfish:finished → result(payload で確保数を渡す)→「参道へ戻る」→ approach。
 *   結果の報酬を所持品スロットへ反映し、approach 復帰時にフライイン演出を起こす。
 */
export default function App({ controller = null }: AppProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // HudRoot に渡す EventBus / controller を state で保持し、useEffect 初期化後に確定させる。
  const [eventBus, setEventBus] = useState<EventBus | null>(null)
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null)
  // 金魚すくい HUD 状態(GoldfishScene 由来。EventBus 非経由で React 橋渡し / T-006)。
  const [goldfishHud, setGoldfishHud] = useState<GoldfishHudState | null>(null)
  // 結果 HUD 状態(ResultScene 由来。EventBus 非経由で React 橋渡し / T-007)。
  const [resultHud, setResultHud] = useState<ResultHudState | null>(null)
  // 所持品(獲得報酬の蓄積。表示のみ・使用機能なしだが実動作で積み上がる / T-007 AC5)。
  const [inventory, setInventory] = useState<RewardInfo[]>([])
  // 所持品フライイン演出のトリガー(報酬追加ごとに +1。InventorySlot が変化を検知して演出する)。
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

    // --- 音響(合成点 / T-008) ---
    // AudioEngine は EventBus を購読するのみ(ゲームコードは audio を直接呼ばない / TECHNICAL_ARCHITECTURE §2)。
    // AudioContext は生成せず first-gesture(クリック/キー)リスナだけ張る = autoplay 制約対応・テスト安全(AC1/AC5/AC7)。
    const audio = new AudioEngine()
    audio.install(events)

    const approachScene = new ApproachScene(renderer)
    const scenes = new SceneManager(events, input)
    scenes.register(approachScene)

    // --- 金魚すくいシーンの登録・配線(合成点 / T-006) ---
    // GoldfishScene は自前で GoldfishSession(T-005)を駆動し、HUD 状態を setHudListener で
    // React へ橋渡しする(EventBus 非経由 = GameEvents 型を増やさない / core 不変)。
    const goldfishScene = new GoldfishScene(renderer)
    goldfishScene.setHudListener((state) => setGoldfishHud(state))
    scenes.register(goldfishScene)

    // --- 結果シーンの登録・配線(合成点 / T-007) ---
    // ResultScene は背景に ApproachScene.render を再利用(屋台が結果表示中も見える / AC6)、
    // 確保数(secured)から段・見出し・店主セリフ・報酬を確定して setResultListener で React へ橋渡しする
    // (EventBus 非経由。会話/金魚 HUD と排他)。「参道へ戻る」は ResultScene が approach へ遷移する。
    const resultScene = new ResultScene(approachScene)
    resultScene.setResultListener((state) => setResultHud(state))
    resultScene.setTransitionHandler((to) => scenes.transition(to))
    scenes.register(resultScene)
    // マウス経路(ui/Result のボタン)の確定要求を ResultScene へ集約する(キーボード経路と同一の出口)。
    requestResultReturnRef.current = () => resultScene.requestReturn()

    // --- 通しループの結線: goldfish:finished → result(T-007) ---
    // セッション終了(torn/timeout/quit いずれも)で result シーンへ遷移し、payload で確保数を渡す。
    // SceneManager は goldfish→['result'] のみ許可(T-006 の goldfish→approach 一時措置を撤去)。
    // result→approach は既存許可。これで通しループ(approach→会話→金魚すくい→result→approach)が一周する。
    const unsubscribeFinished = events.on('goldfish:finished', ({ caught, reason }) => {
      if (scenes.current === 'goldfish') scenes.transition('result', { caught, reason })
    })

    // 結果の報酬を所持品へ反映する(T-007 AC5/AC7)。
    // 「参道へ戻る」(result→approach)の瞬間に 1 回だけ獲得報酬を積み、フライイン演出を起こす
    // (マウス経路=ボタン、キーボード経路=Enter のどちらも ResultScene が approach へ遷移するため、
    //  scene:transition の result→approach を単一の付与ポイントにする = 二重付与なし)。
    // 報酬は直近の結果(確保数)から確定する(GDD §3.2)。
    let pendingReward: RewardInfo | null = null
    const unsubscribeReward = events.on('goldfish:finished', ({ caught }) => {
      pendingReward = resolveResult(caught).reward
    })
    const unsubscribeGrant = events.on('scene:transition', ({ from, to }) => {
      if (from === 'result' && to === 'approach' && pendingReward) {
        const reward = pendingReward
        pendingReward = null
        setInventory((prev) => [...prev, reward])
        setInventoryFlyToken((n) => n + 1)
      }
    })

    // --- 会話シーンの登録・配線(合成点 / D-008・T-004 段B) ---
    // 具象 DialogueController が注入されたときだけ DialogueScene を登録する。
    let unsubscribeChoice: (() => void) | null = null
    if (controller) {
      const dialogueScene = new DialogueScene(approachScene, controller)
      dialogueScene.setTransitionHandler((to) => scenes.transition(to))
      scenes.register(dialogueScene)

      // ApproachScene の「近接中 E/左クリック → 会話」配線(T-004)。
      approachScene.setTransitionHandler((to) => scenes.transition(to))

      // 会話の選択確定(choiceId)に応じた遷移の単一オーナー(合成点 / REV-T-004-1 Major-2)。
      const routeChoice = (choiceId: string): void => {
        if (scenes.current !== 'dialogue') return
        if (choiceId === 'play') {
          scenes.transition('goldfish')
          return
        }
        scenes.transition('approach')
      }
      unsubscribeChoice = events.on('dialogue:choice', ({ choiceId }) => routeChoice(choiceId))
    }

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
      unsubscribeChoice?.()
      unsubscribeFinished()
      unsubscribeReward()
      unsubscribeGrant()
      requestResultReturnRef.current = null
      loop.stop()
      input.detach()
      audio.dispose()
      approachScene.dispose()
      goldfishScene.dispose()
      renderer.dispose()
      setEventBus(null)
      setGoldfishHud(null)
      setResultHud(null)
    }
  }, [controller])

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      {/* React HUD オーバーレイ(D-008)。EventBus 由来の会話表示状態を購読し、
          会話/金魚/結果/所持品のオーバーレイをマウントする枠。controller 未注入(段A)時は会話を描画しない。 */}
      {eventBus !== null && (
        <HudRoot
          events={eventBus}
          controller={controller}
          goldfishHud={goldfishHud}
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
