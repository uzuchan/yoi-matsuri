import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../src/core/EventBus'
import type {
  DialogueController,
  DialogueOutcome,
  DialogueView,
  GameKey,
  InputManager,
  MouseState,
  SceneContext,
} from '../../src/core'
import { DialogueScene } from '../../src/scenes/dialogue/DialogueScene'
import type { ApproachScene } from '../../src/scenes/approach/ApproachScene'

/**
 * DialogueScene(T-004 段A)の駆動ロジック契約のテスト。
 * 会話の中身(セリフ・状態遷移)は段B(gameplay-engineer)が実装するため、ここでは
 * 「入力エッジ → controller メソッド呼び出し」「outcome → 遷移ハンドラ」「表示状態 → イベント発火」
 * という土台の配線のみを検証する(具象 controller は使わず、観測可能なフェイクを注入する)。
 */

/** 観測可能なフェイク DialogueController。view は外部から差し替えられる。 */
function createFakeController() {
  let view: DialogueView = {
    speaker: '店主',
    text: 'こんばんは',
    visibleText: '',
    typing: true,
    choices: [],
    focusedChoiceIndex: -1,
    active: true,
  }
  const calls: string[] = []
  const advanceOutcome: { value: DialogueOutcome } = { value: { kind: 'continue' } }
  const confirmOutcome: { value: DialogueOutcome } = { value: { kind: 'continue' } }

  const controller: DialogueController = {
    start: () => calls.push('start'),
    tick: () => calls.push('tick'),
    advance: () => {
      calls.push('advance')
      return advanceOutcome.value
    },
    // 実 controller 同様、フォーカスを選択肢範囲内でクランプ移動する(端では動かない)。
    // これにより DialogueScene の「focusedChoiceIndex が実際に変化した時だけ select を鳴らす」分岐を
    // フェイクでも忠実に検証できる。
    moveFocus: (delta: number) => {
      calls.push(`moveFocus:${delta}`)
      if (view.choices.length === 0) return
      const next = Math.max(0, Math.min(view.choices.length - 1, view.focusedChoiceIndex + delta))
      view = { ...view, focusedChoiceIndex: next }
    },
    focus: (index: number) => calls.push(`focus:${index}`),
    confirm: () => {
      calls.push('confirm')
      return confirmOutcome.value
    },
    abort: () => {
      calls.push('abort')
      view = { ...view, active: false }
      return { kind: 'aborted' }
    },
    view: () => view,
  }

  return {
    controller,
    calls,
    setView: (next: Partial<DialogueView>) => {
      view = { ...view, ...next }
    },
    setAdvanceOutcome: (o: DialogueOutcome) => {
      advanceOutcome.value = o
    },
    setConfirmOutcome: (o: DialogueOutcome) => {
      confirmOutcome.value = o
    },
  }
}

/** 押下状態とマウスを制御できるフェイク InputManager。 */
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

/** render/resize しか呼ばれない ApproachScene のスタブ(three を起動しない)。 */
function createBackgroundStub() {
  const render = vi.fn()
  const resize = vi.fn()
  const background = { render, resize } as unknown as ApproachScene
  return { background, render, resize }
}

function setup() {
  const events = new EventBus()
  const fakeController = createFakeController()
  const fakeInput = createFakeInput()
  const bg = createBackgroundStub()
  const scene = new DialogueScene(bg.background, fakeController.controller)
  const transition = vi.fn()
  scene.setTransitionHandler(transition)
  const ctx: SceneContext = { events, input: fakeInput.input }
  return { events, scene, ctx, transition, ...fakeController, ...fakeInput, ...bg }
}

const DT = 1 / 60

describe('DialogueScene(段A 駆動ロジック)', () => {
  it('enter で controller.start を呼び、初期表示状態を dialogue:view-changed で発火する', () => {
    const { scene, ctx, events, calls } = setup()
    const handler = vi.fn()
    events.on('dialogue:view-changed', handler)

    scene.enter(ctx)

    expect(calls).toContain('start')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].view.active).toBe(true)
  })

  it('update で毎フレーム controller.tick を呼ぶ(タイピング進行)', () => {
    const { scene, ctx, calls } = setup()
    scene.enter(ctx)
    calls.length = 0

    scene.update(DT)

    expect(calls).toContain('tick')
  })

  it('セリフ送り中: Enter の立ち上がりで advance を1回だけ呼ぶ(ホールド中は連続しない)', () => {
    const { scene, ctx, calls, press, release } = setup()
    scene.enter(ctx)
    calls.length = 0

    press('Enter')
    scene.update(DT)
    scene.update(DT) // 押しっぱなし: 立ち上がりは最初の1回のみ
    release('Enter')
    scene.update(DT)

    expect(calls.filter((c) => c === 'advance')).toHaveLength(1)
  })

  it('セリフ送り中: マウスクリックの立ち上がりで advance を呼ぶ', () => {
    const { scene, ctx, calls, setMouse } = setup()
    scene.enter(ctx)
    calls.length = 0

    setMouse(true)
    scene.update(DT)

    expect(calls).toContain('advance')
  })

  it('選択肢表示中: ↑↓ で moveFocus、Enter で confirm を呼ぶ(advance は呼ばない)', () => {
    const { scene, ctx, calls, setView, press, release } = setup()
    scene.enter(ctx)
    setView({ typing: false, choices: [{ id: 'play', label: '遊んでいく' }], focusedChoiceIndex: 0 })
    calls.length = 0

    press('ArrowDown')
    scene.update(DT)
    release('ArrowDown')
    press('Enter')
    scene.update(DT)

    expect(calls).toContain('moveFocus:1')
    expect(calls).toContain('confirm')
    expect(calls).not.toContain('advance')
  })

  it('Esc の立ち上がりで abort を呼び approach へ遷移する', () => {
    const { scene, ctx, calls, transition, press } = setup()
    scene.enter(ctx)
    calls.length = 0

    press('Escape')
    scene.update(DT)

    expect(calls).toContain('abort')
    expect(transition).toHaveBeenCalledWith('approach')
  })

  it('選択確定(outcome=choice)で dialogue:choice を発火するが、自身では遷移しない(遷移オーナーは App.routeChoice)', () => {
    const { scene, ctx, events, transition, setView, setConfirmOutcome, press } = setup()
    const choiceHandler = vi.fn()
    events.on('dialogue:choice', choiceHandler)
    scene.enter(ctx)
    setView({ typing: false, choices: [{ id: 'later', label: 'またあとで' }], focusedChoiceIndex: 0 })
    setConfirmOutcome({ kind: 'choice', choiceId: 'later' })

    press('Enter')
    scene.update(DT)

    // 'dialogue:choice' は発火する。遷移は App.routeChoice が単一オーナーとして決めるため、
    // DialogueScene は choice では transition しない(REV-T-004-1 Major-2: 二重遷移の解消)。
    expect(choiceHandler).toHaveBeenCalledWith({ choiceId: 'later' })
    expect(transition).not.toHaveBeenCalled()
  })

  it('SFX(AC7): セリフ送りで dialogue-next を発火する(キーボード経路。マウス経路と一致)', () => {
    const { scene, ctx, events, setAdvanceOutcome, press } = setup()
    const sfx = vi.fn()
    events.on('sfx:play', sfx)
    scene.enter(ctx)
    setAdvanceOutcome({ kind: 'continue' })

    press('Enter')
    scene.update(DT)

    expect(sfx).toHaveBeenCalledWith({ name: 'dialogue-next' })
  })

  it('SFX(AC7): フォーカスが実際に動いた時だけ select を発火する(同一indexでは鳴らさない)', () => {
    const { scene, ctx, events, setView, press, release } = setup()
    const sfx = vi.fn()
    events.on('sfx:play', sfx)
    scene.enter(ctx)
    setView({
      typing: false,
      choices: [
        { id: 'play', label: '遊んでいく' },
        { id: 'later', label: 'またあとで' },
      ],
      focusedChoiceIndex: 0,
    })

    // フォーカスが 0→1 へ動く(↓): select 発火。
    press('ArrowDown')
    scene.update(DT)
    expect(sfx).toHaveBeenCalledWith({ name: 'select' })

    // 末尾(index=1)で更に ↓ を押してもクランプで動かない → 鳴らさない。
    sfx.mockClear()
    release('ArrowDown')
    scene.update(DT) // エッジをリセット
    press('ArrowDown')
    scene.update(DT)
    expect(sfx).not.toHaveBeenCalledWith({ name: 'select' })
  })

  it('SFX(AC7): 選択確定で confirm を発火する(キーボード経路。マウス経路と一致)', () => {
    const { scene, ctx, events, setView, setConfirmOutcome, press } = setup()
    const sfx = vi.fn()
    events.on('sfx:play', sfx)
    scene.enter(ctx)
    setView({ typing: false, choices: [{ id: 'later', label: 'またあとで' }], focusedChoiceIndex: 0 })
    setConfirmOutcome({ kind: 'choice', choiceId: 'later' })

    press('Enter')
    scene.update(DT)

    expect(sfx).toHaveBeenCalledWith({ name: 'confirm' })
  })

  it('表示状態が変化したフレームだけ dialogue:view-changed を発火する(無変化では再発火しない)', () => {
    const { scene, ctx, events, setView } = setup()
    scene.enter(ctx) // 初回1回
    const handler = vi.fn()
    events.on('dialogue:view-changed', handler)

    scene.update(DT) // 無変化 → 発火しない
    expect(handler).not.toHaveBeenCalled()

    setView({ visibleText: 'こんばんは' }) // 可視テキストが進んだ
    scene.update(DT)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('render は背景 ApproachScene.render(alpha) を呼ぶ(背景に参道worldを描く)', () => {
    const { scene, ctx, render } = setup()
    scene.enter(ctx)

    scene.render(0.5)

    expect(render).toHaveBeenCalledWith(0.5)
  })
})
