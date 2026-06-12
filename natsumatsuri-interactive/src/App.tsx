import { useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, WebGLRenderer } from 'three'
import { EventBus, GameLoop, InputManager, SceneManager } from './core'
import { ApproachScene } from './scenes/approach/ApproachScene'

interface DebugStats {
  fps: number
  drawCalls: number
}

const DEBUG_STATS_INTERVAL_MS = 200

function isDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

/**
 * ゲームシェル: 全画面canvasにWebGLRendererをマウントし、
 * GameLoop + SceneManager を起動するReactルート。
 * ?debug=1 のときのみFPS/draw callのデバッグオーバーレイを表示する。
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
    const input = new InputManager()
    input.attach(window)

    const scenes = new SceneManager(events, input)
    scenes.register(new ApproachScene(renderer))
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
      loop.stop()
      input.detach()
      renderer.dispose()
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
      {debugStats !== null && (
        <div className="debug-overlay" role="status">
          <span>FPS {debugStats.fps.toFixed(1)}</span>
          <span>draw calls {debugStats.drawCalls}</span>
        </div>
      )}
    </>
  )
}
