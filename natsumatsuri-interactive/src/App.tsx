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
 * - シーンの生成・登録(ApproachScene / DialogueScene)
 * - DialogueScene への依存注入: ApproachScene 参照(背景描画)・具象 DialogueController・遷移ハンドラ
 * - HudRoot への controller 引き渡し(クリック入力の集約先)
 */
export default function App({ controller = null }: AppProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // HudRoot に渡す EventBus / controller を state で保持し、useEffect 初期化後に確定させる。
  const [eventBus, setEventBus] = useState<EventBus | null>(null)
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null)

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

    const approachScene = new ApproachScene(renderer)
    const scenes = new SceneManager(events, input)
    scenes.register(approachScene)

    // --- 会話シーンの登録・配線(合成点 / D-008・T-004 段B) ---
    // 具象 DialogueController が注入されたときだけ DialogueScene を登録する。
    // - 背景描画のため ApproachScene 参照を注入(屋台が会話中も見える / AC2)。
    // - Scene は SceneManager を直接参照しない core 設計のため、遷移は合成点で束縛したハンドラ経由で行う。
    let unsubscribeChoice: (() => void) | null = null
    if (controller) {
      const dialogueScene = new DialogueScene(approachScene, controller)
      // DialogueScene の遷移ハンドラ。合成点が SceneManager.transition を束縛する。
      // DialogueScene が直接遷移するのは Esc 打ち切り(dialogue→approach)のみで、choice 後は遷移しない
      // (choice の遷移は下記 routeChoice が単一オーナーとして決める / REV-T-004-1 Major-2)。
      // よって二重遷移は起きず、ここは素のハンドラでよい(以前の try/catch 吸収は不要になった)。
      dialogueScene.setTransitionHandler((to) => scenes.transition(to))
      scenes.register(dialogueScene)

      // ApproachScene の「近接中 E/左クリック → 会話」配線(T-004)。
      approachScene.setTransitionHandler((to) => scenes.transition(to))

      // 会話の選択確定(choiceId)に応じた遷移の単一オーナー(合成点 / REV-T-004-1 Major-2)。
      // キーボード経路: DialogueScene が確定時に 'dialogue:choice' を発火する(自身では遷移しない)。
      // マウス経路: ui/Dialogue が確定/締めセリフ送り切りで 'dialogue:choice' を発火する。
      // どちらも同じ choiceId で本ハンドラへ集約し、choice に対する遷移はここだけが決める
      // (二重遷移なし / INTERACTION_SPEC §1-3: 行き止まりなし)。
      const routeChoice = (choiceId: string): void => {
        // 既に dialogue を抜けていれば何もしない(重複発火・既遷移ガード)。
        if (scenes.current !== 'dialogue') return
        if (choiceId === 'play') {
          // 「遊んでいく」→ goldfish(AC5)。goldfish は T-005/006 まで未登録のため throw する。
          // コンソール例外を出さず(AC5)、安全に approach へフォールバックする。ダミー画面は作らない。
          // T-006 で goldfish 登録後は transition('goldfish') が成功し、本フォールバックは不要になる
          // (引き継ぎ: 報告の「残課題」参照)。
          try {
            scenes.transition('goldfish')
            return
          } catch {
            // 未登録: 下のフォールバックで approach へ。
          }
        }
        // 「またあとで」、および goldfish 未登録時の「遊んでいく」: 参道へ戻る。
        if (scenes.current === 'dialogue') scenes.transition('approach')
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
      loop.stop()
      input.detach()
      approachScene.dispose()
      renderer.dispose()
      setEventBus(null)
    }
  }, [controller])

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      {/* React HUD オーバーレイ(D-008)。EventBus 由来の会話表示状態を購読し、
          段B の会話オーバーレイ(ui/Dialogue)をマウントする枠。controller 未注入(段A)時は何も描画しない。 */}
      {eventBus !== null && <HudRoot events={eventBus} controller={controller} />}
      {debugStats !== null && (
        <div className="debug-overlay" role="status">
          <span>FPS {debugStats.fps.toFixed(1)}</span>
          <span>draw calls {debugStats.drawCalls}</span>
        </div>
      )}
    </>
  )
}
