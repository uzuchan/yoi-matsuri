import { describe, expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import { EventBus } from '../../src/core/EventBus'
import type { GameKey, InputManager, MouseState, SceneContext } from '../../src/core'
import { ResultScene, type ResultHudState } from '../../src/scenes/result/ResultScene'
import type { ApproachScene } from '../../src/scenes/approach/ApproachScene'
import { createStallRegistry } from '../../src/scenes/stall/definitions'
import { STALL_ID } from '../../src/world'

/**
 * ResultScene(T-007)の駆動ロジック契約のテスト。
 * 結果の段判定は game/result の純TS(result.test.ts で網羅)なので、ここでは
 * 「payload(確保数)→ 結果 HUD 橋渡し」「結果表示時の sfx 発火」「クリック/Enter → approach 遷移」
 * 「二重遷移しない」「背景 ApproachScene.render を呼ぶ」という配線を検証する。
 */

/** 押下状態とマウスを制御できるフェイク InputManager(dialogue-scene.test と同方式)。 */
function createFakeInput() {
  const down = new Set<GameKey>()
  const mouse: MouseState = { x: 0, y: 0, pressed: false }
  const input = {
    isDown: (key: GameKey) => down.has(key),
    get mouse() {
      return mouse
    },
  } as unknown as InputManager
  return {
    input,
    press: (key: GameKey) => down.add(key),
    release: (key: GameKey) => down.delete(key),
    setMouse: (pressed: boolean) => {
      mouse.pressed = pressed
    },
  }
}

/** renderWith しか呼ばれない ApproachScene のスタブ(three を起動しない)。 */
function createBackgroundStub() {
  const render = vi.fn()
  const renderWith = vi.fn()
  const resize = vi.fn()
  const background = { render, renderWith, resize } as unknown as ApproachScene
  return { background, render, renderWith, resize }
}

function setup() {
  const events = new EventBus()
  const fakeInput = createFakeInput()
  const bg = createBackgroundStub()
  // D-010: ResultScene は registry の resultRules/placement で結果・カメラを解決する。
  const registry = createStallRegistry()
  const scene = new ResultScene(bg.background, registry)
  const transition = vi.fn()
  scene.setTransitionHandler(transition)
  const hudStates: ResultHudState[] = []
  scene.setResultListener((s) => hudStates.push(s))
  return { events, scene, transition, hudStates, ...fakeInput, ...bg }
}

const DT = 1 / 60

/**
 * D-010: enter の payload は { stallId, result: StallResult }。score=確保数、reason=timeout で
 * 「すくえなかった/成功」段を再現する(従来 caught と同じ意味)。
 */
function enterWith(scene: ResultScene, events: EventBus, input: InputManager, caught: number): void {
  const ctx: SceneContext = {
    events,
    input,
    payload: { stallId: STALL_ID, result: { score: caught, reason: 'timeout' } },
  }
  scene.enter(ctx)
}

describe('ResultScene(駆動ロジック / T-007)', () => {
  it('enter で payload(確保数)から結果 HUD を active 化して橋渡しする', () => {
    const { scene, events, input, hudStates } = setup()
    enterWith(scene, events, input, 2)

    expect(hudStates).toHaveLength(1)
    expect(hudStates[0].active).toBe(true)
    expect(hudStates[0].outcome?.tier).toBe('success')
    expect(hudStates[0].outcome?.score).toBe(2)
    expect(hudStates[0].outcome?.reward.id).toBe('reward:bag-small')
  })

  it('payload に result がない/不正でも 0 点(失敗)として安全に扱う', () => {
    const { scene, events, input, hudStates } = setup()
    // stallId は必要(未登録だと throw)だが result が無ければ 0 点・破損へフォールバックする。
    scene.enter({ events, input, payload: { stallId: STALL_ID } } as SceneContext)
    expect(hudStates[0].outcome?.tier).toBe('fail')
    expect(hudStates[0].outcome?.score).toBe(0)
  })

  it('結果表示時に sfx を発火する: 成功/大成功=result-success / 失敗=result-fail(AUDIO_SPEC §4)', () => {
    const success = setup()
    const sfxS = vi.fn()
    success.events.on('sfx:play', sfxS)
    enterWith(success.scene, success.events, success.input, 1)
    expect(sfxS).toHaveBeenCalledWith({ name: 'result-success' })

    const great = setup()
    const sfxG = vi.fn()
    great.events.on('sfx:play', sfxG)
    enterWith(great.scene, great.events, great.input, 5)
    expect(sfxG).toHaveBeenCalledWith({ name: 'result-success' })

    const fail = setup()
    const sfxF = vi.fn()
    fail.events.on('sfx:play', sfxF)
    enterWith(fail.scene, fail.events, fail.input, 0)
    expect(sfxF).toHaveBeenCalledWith({ name: 'result-fail' })
  })

  it('Enter の立ち上がりで approach へ遷移し confirm を発火する(キーボード経路 / INTERACTION_SPEC §3.4)', () => {
    const { scene, events, input, transition, press } = setup()
    const sfx = vi.fn()
    events.on('sfx:play', sfx)
    enterWith(scene, events, input, 1)

    press('Enter')
    scene.update(DT)

    expect(transition).toHaveBeenCalledWith('approach')
    expect(sfx).toHaveBeenCalledWith({ name: 'confirm' })
  })

  it('マウスクリックの立ち上がりで approach へ遷移する(マウス経路 / §1原則)', () => {
    const { scene, events, input, transition, setMouse } = setup()
    enterWith(scene, events, input, 0)

    setMouse(true)
    scene.update(DT)

    expect(transition).toHaveBeenCalledWith('approach')
  })

  it('enter 直後に押されたままの Enter は遷移に拾わない(エッジ基準を揃える)', () => {
    const { scene, events, input, transition, press } = setup()
    press('Enter') // goldfish 終了時に押していた Enter が残っている想定
    enterWith(scene, events, input, 1)

    scene.update(DT) // 立ち上がりではない(enter 時点で既に押下) → 遷移しない

    expect(transition).not.toHaveBeenCalled()
  })

  it('二重遷移しない: クリックと Enter が同時/連続で来ても transition は 1 回だけ', () => {
    const { scene, events, input, transition, press, setMouse } = setup()
    enterWith(scene, events, input, 1)

    press('Enter')
    setMouse(true)
    scene.update(DT)
    scene.update(DT) // 既に returning=true なので何もしない

    expect(transition).toHaveBeenCalledTimes(1)
  })

  it('requestReturn(マウスボタン経路)も approach へ遷移し、二重に呼んでも 1 回だけ', () => {
    const { scene, events, input, transition } = setup()
    enterWith(scene, events, input, 3)

    scene.requestReturn()
    scene.requestReturn()

    expect(transition).toHaveBeenCalledTimes(1)
    expect(transition).toHaveBeenCalledWith('approach')
  })

  it('exit で結果 HUD を非表示にする(他HUDと排他)', () => {
    const { scene, events, input, hudStates } = setup()
    enterWith(scene, events, input, 1)
    hudStates.length = 0

    scene.exit()

    expect(hudStates).toHaveLength(1)
    expect(hudStates[0].active).toBe(false)
    expect(hudStates[0].outcome).toBeNull()
  })

  it('render は背景 ApproachScene.renderWith(resultCamera) を呼ぶ(result 専用カメラで屋台を描く / AC6・Major-2)', () => {
    const { scene, events, input, renderWith, render } = setup()
    enterWith(scene, events, input, 1)

    scene.render(0.5)

    // approach 追従カメラ流用(render)ではなく、result 専用カメラ経路(renderWith)を使う。
    expect(render).not.toHaveBeenCalled()
    expect(renderWith).toHaveBeenCalledTimes(1)
    const cam = renderWith.mock.calls[0][0]
    expect(cam).toBeDefined()
    // ART §5: FOV 50°、屋台正面(参道側=-x 側)へ水平距離 4.5m・高さ 1.8m。
    expect(cam.fov).toBe(50)
    expect(cam.position.x).toBeCloseTo(5 - 4.5, 5) // STALL_POSITION.x - 4.5(参道側)
    expect(cam.position.y).toBeCloseTo(1.8, 5)
    // T-009(art-director Minor 解消): rig を +z へ 1.8m パンし店主を画面左へ寄せる。
    // カメラ z = 店主頭部 z(-25.7)+ パン 1.8 = -23.9(屋台中心 z=-26 から +z 側)。
    expect(cam.position.z).toBeCloseTo(-25.7 + 1.8, 5)
  })

  it('店主頭部が中央パネル背後から左へはみ出して読める(T-009 / ART §5 構図要件・Minor 解消)', () => {
    const { scene, events, input, renderWith } = setup()
    enterWith(scene, events, input, 1)
    scene.resize(1280, 720) // 実画面比でカメラの aspect を確定する
    scene.render(0.5)

    const cam = renderWith.mock.calls[0][0]
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()

    // 店主頭部 world ≈ (4.5, 1.66, -25.7)(world/stall.ts: group 回転後 + 頭部 local y1.66)。
    const headNdc = new Vector3(4.5, 1.66, -25.7).project(cam)
    const headPx = (headNdc.x * 0.5 + 0.5) * 1280

    // 画面内に居る(クリップされない)。
    expect(headNdc.x).toBeGreaterThan(-1)
    expect(headNdc.x).toBeLessThan(1)
    // 中央の結果パネル(width min(560px, 100vw-48px)=1280px 時は 560px、左端 ≈ x640-280=360px)の
    // 左外へ頭が出ること。余白を見て head が x<340px(パネル左端より左)に来ることを要求する。
    expect(headPx).toBeLessThan(340)

    // §7-4 維持: 裸電球2個(world (5,2.1,-26.9)/(5,2.1,-25.1))が引き続き画面内に残る。
    for (const bulb of [new Vector3(5, 2.1, -26.9), new Vector3(5, 2.1, -25.1)]) {
      const b = bulb.project(cam)
      expect(b.x).toBeGreaterThan(-1)
      expect(b.x).toBeLessThan(1)
    }
  })

  it('resize は result 専用カメラの aspect を更新する(approach カメラは触らない / Major-2)', () => {
    const { scene, events, input, renderWith, resize } = setup()
    enterWith(scene, events, input, 1)

    scene.resize(1280, 720)
    scene.render(0)

    // 背景の resize は呼ばない(approach 追従カメラの aspect は別管理)。
    expect(resize).not.toHaveBeenCalled()
    const cam = renderWith.mock.calls[0][0]
    expect(cam.aspect).toBeCloseTo(1280 / 720, 5)
  })
})
