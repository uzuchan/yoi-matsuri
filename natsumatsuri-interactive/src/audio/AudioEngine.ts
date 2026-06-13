/**
 * AudioEngine — 宵祭の音響の中枢(AUDIO_SPEC §2/§5、T-008)。
 *
 * 責務:
 *  - AudioContext のライフサイクル管理。**初回ユーザー操作(クリック/キー)で resume**(autoplay 制約)。
 *    それまでの音響イベントは破棄してよい(AUDIO_SPEC §1)。
 *  - ミックスグラフ(AUDIO_SPEC §2):
 *      [各音源] → [カテゴリ Gain: ambient0.6 / music0.5 / sfx0.9] → [マスター Gain 0.8]
 *               → [DynamicsCompressor(リミッタ)] → destination
 *  - EventBus を購読して鳴らす(ゲームコードからは直接呼ばれない / TECHNICAL_ARCHITECTURE §2):
 *      sfx:play{name} / goldfish:* / scene:transition / stall:approach / stall:leave
 *      / fireworks:launch / fireworks:burst(花火 — T-009 で発火側・購読を有効化済み)
 *  - 空間/場面ミックス: 屋台近接で祭囃子・群衆を強める(クロスフェード)、goldfish 中は環境音 -6dB、
 *    result/approach で復帰。
 *
 * 設計上の安全策(AC6/AC7):
 *  - AudioContext を持たない環境(node/test/SSR、未対応ブラウザ)では生成を遅延し、resume 失敗時は no-op。
 *    new AudioEngine() しただけでは AudioContext を作らない(install 時に first-gesture リスナだけ張る)。
 *  - マスターに必ず DynamicsCompressor を挟み、爆音・クリップを構造的に防ぐ。
 */
import type { EventBus, GameEvents } from '../core'
import { createCrickets } from './ambient/crickets'
import { createCrowd } from './ambient/crowd'
import { createHayashi } from './ambient/hayashi'
import { FIREWORKS_SFX } from './ambient/fireworksSfx'
import type { AmbientLayer } from './ambient/types'
import { resolveSfx } from './sfx'

// --- ミックス定数(AUDIO_SPEC §2) ---
const MASTER_GAIN = 0.8
const CATEGORY_GAIN = { ambient: 0.6, music: 0.5, sfx: 0.9 } as const

// 近接クロスフェード: 屋台から離れている既定の祭囃子/群衆の倍率(遠景)と、近接時の倍率(近景)。
const HAYASHI_FAR = 0.35 // 遠くでは笛がかすかに(AUDIO_SPEC §3)
const HAYASHI_NEAR = 1.0
const CROWD_FAR = 0.45
const CROWD_NEAR = 1.0
const CRICKETS_FAR = 1.0 // 屋台から離れるほどスズムシが目立つ(AUDIO_SPEC §3)
const CRICKETS_NEAR = 0.45
const CROSSFADE_SEC = 1.2

// goldfish シーン中の環境音ダッキング(-6dB ≒ 0.5 倍)。
const DUCK_FACTOR = 0.5
const DUCK_SEC = 0.4

type GestureTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

// この環境で Web Audio が使えるか(test/SSR を安全に no-op 化)。
function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof globalThis === 'undefined') return undefined
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return g.AudioContext ?? g.webkitAudioContext
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private categories: Record<keyof typeof CATEGORY_GAIN, GainNode> | null = null

  // 環境音レイヤーと、その近接/ダッキング制御用 Gain。
  private crickets: AmbientLayer | null = null
  private crowd: AmbientLayer | null = null
  private hayashi: AmbientLayer | null = null
  private cricketsProx: GainNode | null = null // 近接クロスフェード(スズムシ)
  private crowdProx: GainNode | null = null
  private hayashiProx: GainNode | null = null
  private ambientDuck: GainNode | null = null // goldfish ダッキング(ambient カテゴリ全体)
  private musicDuck: GainNode | null = null // goldfish ダッキング(music = 祭囃子)

  private nearStall = false
  private started = false // 環境音を発音開始済みか
  private disposed = false

  private readonly unsubscribers: (() => void)[] = []
  private gestureTarget: GestureTarget | null = null
  private gestureHandler: (() => void) | null = null

  /**
   * EventBus を購読し、初回ユーザー操作で resume するためのリスナを target(既定 window)へ張る。
   * AudioContext はまだ作らない(初回操作時に生成 = autoplay 対応・テスト安全)。
   */
  install(events: EventBus, gestureTarget?: GestureTarget): void {
    if (this.disposed) return
    this.subscribe(events)

    const target = gestureTarget ?? (typeof window !== 'undefined' ? window : null)
    if (!target) return
    this.gestureTarget = target
    const handler = (): void => {
      void this.resume()
      this.detachGesture()
    }
    this.gestureHandler = handler
    // pointerdown / keydown / touchstart のいずれか最初の1回で resume(autoplay 制約)。
    target.addEventListener('pointerdown', handler)
    target.addEventListener('keydown', handler)
    target.addEventListener('touchstart', handler)
  }

  private detachGesture(): void {
    if (this.gestureTarget && this.gestureHandler) {
      this.gestureTarget.removeEventListener('pointerdown', this.gestureHandler)
      this.gestureTarget.removeEventListener('keydown', this.gestureHandler)
      this.gestureTarget.removeEventListener('touchstart', this.gestureHandler)
    }
    this.gestureTarget = null
    this.gestureHandler = null
  }

  /**
   * AudioContext を(必要なら)生成し resume する。初回ユーザー操作のハンドラから呼ばれる。
   * 未対応環境では何もしない(no-op)。冪等。
   */
  async resume(): Promise<void> {
    if (this.disposed) return
    if (!this.ctx) {
      const Ctor = audioContextCtor()
      if (!Ctor) return // 未対応環境(test/SSR)は no-op
      try {
        this.ctx = new Ctor()
      } catch {
        this.ctx = null
        return
      }
      this.buildGraph(this.ctx)
    }
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume()
    } catch {
      // resume 失敗(ユーザー操作が認められない等)は致命でない。
    }
    this.startAmbientIfNeeded()
  }

  /** ミックスグラフ(AUDIO_SPEC §2)と環境音レイヤーを構築する。 */
  private buildGraph(ctx: AudioContext): void {
    // マスター → リミッタ → destination。
    const compressor = ctx.createDynamicsCompressor()
    // リミッタ寄りの設定: 高めスレッショルド・強い ratio・速い release で -3dBFS 超えを抑える(AUDIO_SPEC §6)。
    compressor.threshold.value = -6
    compressor.knee.value = 6
    compressor.ratio.value = 12
    compressor.attack.value = 0.003
    compressor.release.value = 0.25
    compressor.connect(ctx.destination)

    const master = ctx.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(compressor)

    // カテゴリ Gain。ambient と music は goldfish ダッキング用の中間 Gain を1段挟む。
    const ambient = ctx.createGain()
    ambient.gain.value = CATEGORY_GAIN.ambient
    const ambientDuck = ctx.createGain()
    ambientDuck.gain.value = 1
    ambient.connect(master)
    ambientDuck.connect(ambient)
    this.ambientDuck = ambientDuck

    const music = ctx.createGain()
    music.gain.value = CATEGORY_GAIN.music
    const musicDuck = ctx.createGain()
    musicDuck.gain.value = 1
    music.connect(master)
    musicDuck.connect(music)
    this.musicDuck = musicDuck

    const sfx = ctx.createGain()
    sfx.gain.value = CATEGORY_GAIN.sfx
    sfx.connect(master)

    this.categories = { ambient, music, sfx }

    // --- 環境音レイヤー ---
    // 近接クロスフェード用の Gain を各レイヤーに挟む。初期は「遠景」(approach 入口は屋台から離れている)。
    const cricketsProx = ctx.createGain()
    cricketsProx.gain.value = CRICKETS_FAR
    cricketsProx.connect(ambientDuck)
    const crickets = createCrickets(ctx)
    crickets.output.connect(cricketsProx)
    this.crickets = crickets
    this.cricketsProx = cricketsProx

    const crowdProx = ctx.createGain()
    crowdProx.gain.value = CROWD_FAR
    crowdProx.connect(ambientDuck)
    const crowd = createCrowd(ctx)
    crowd.output.connect(crowdProx)
    this.crowd = crowd
    this.crowdProx = crowdProx

    // 祭囃子は music カテゴリ(AUDIO_SPEC §2)。
    const hayashiProx = ctx.createGain()
    hayashiProx.gain.value = HAYASHI_FAR
    hayashiProx.connect(musicDuck)
    const hayashi = createHayashi(ctx)
    hayashi.output.connect(hayashiProx)
    this.hayashi = hayashi
    this.hayashiProx = hayashiProx
  }

  private startAmbientIfNeeded(): void {
    if (this.started || !this.ctx) return
    this.started = true
    this.crickets?.start()
    this.crowd?.start()
    this.hayashi?.start()
  }

  // --- EventBus 購読 ---

  private subscribe(events: EventBus): void {
    this.unsubscribers.push(
      events.on('sfx:play', ({ name }) => this.playSfx(name)),
      events.on('stall:approach', () => this.setNearStall(true)),
      events.on('stall:leave', () => this.setNearStall(false)),
      events.on('scene:transition', (p) => this.onSceneTransition(p)),
      // 花火(T-009): 視覚側(world/fireworks)が launch → 約1.2s → burst を発火する。
      // launch=上昇ホイッスル / burst=ノイズバースト+低域ドン(AUDIO_SPEC §3)。合成関数は
      // ambient/fireworksSfx.ts、再生は sfx カテゴリ経由でマスター→リミッタを通る(playFireworks)。
      events.on('fireworks:launch', () => this.playFireworks('launch')),
      events.on('fireworks:burst', () => this.playFireworks('burst')),
      // goldfish:* は将来の追加演出フックのため購読しておく(現状 sfx は sfx:play 経由で完結)。
      // goldfish:caught/poi-torn/finished の音は GoldfishScene が sfx:play へ写像済み(eventMap)。
    )
  }

  /** 効果音を都度合成して鳴らす(AUDIO_SPEC §4)。未知の name / 未起動は安全に no-op。 */
  private playSfx(name: string): void {
    const ctx = this.ctx
    const sfxBus = this.categories?.sfx
    if (!ctx || !sfxBus || ctx.state !== 'running') return
    const synth = resolveSfx(name)
    if (!synth) return
    synth(ctx, sfxBus, ctx.currentTime)
  }

  /**
   * 花火 sfx(T-009)。`fireworks:launch` / `fireworks:burst` 購読から呼ばれる。
   * sfx カテゴリ(→ master → リミッタ)で合成する(打ち上げ/開花のいずれも単発で完結)。
   * 未起動(resume 前)は安全に no-op。
   */
  playFireworks(kind: 'launch' | 'burst'): void {
    const ctx = this.ctx
    const sfxBus = this.categories?.sfx
    if (!ctx || !sfxBus || ctx.state !== 'running') return
    FIREWORKS_SFX[kind](ctx, sfxBus, ctx.currentTime)
  }

  /** 屋台近接で祭囃子・群衆を強め、スズムシを控える(クロスフェード / AUDIO_SPEC §3・AC4)。 */
  private setNearStall(near: boolean): void {
    if (this.nearStall === near) return
    this.nearStall = near
    this.rampProximity()
  }

  private rampProximity(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const near = this.nearStall
    this.rampGain(this.hayashiProx, near ? HAYASHI_NEAR : HAYASHI_FAR, t)
    this.rampGain(this.crowdProx, near ? CROWD_NEAR : CROWD_FAR, t)
    this.rampGain(this.cricketsProx, near ? CRICKETS_NEAR : CRICKETS_FAR, t)
  }

  /** シーン遷移で環境音をダッキング/復帰する(AUDIO_SPEC §3・AC4)。 */
  private onSceneTransition({ to }: GameEvents['scene:transition']): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    // goldfish 中は環境音を -6dB(没入)。それ以外(approach/dialogue/result)では復帰。
    const duck = to === 'goldfish' ? DUCK_FACTOR : 1
    this.rampGain(this.ambientDuck, duck, t, DUCK_SEC)
    this.rampGain(this.musicDuck, duck, t, DUCK_SEC)
  }

  private rampGain(node: GainNode | null, target: number, now: number, dur = CROSSFADE_SEC): void {
    if (!node) return
    const param = node.gain
    // 現在値から滑らかに(setTargetAtTime は指数。時定数を dur/3 にして dur 程度で到達)。
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.setTargetAtTime(target, now, Math.max(0.05, dur / 3))
  }

  /** 後始末: 購読解除・リスナ解除・AudioContext クローズ・レイヤー解放。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const off of this.unsubscribers) off()
    this.unsubscribers.length = 0
    this.detachGesture()
    this.crickets?.dispose()
    this.crowd?.dispose()
    this.hayashi?.dispose()
    this.crickets = this.crowd = this.hayashi = null
    if (this.ctx) {
      const ctx = this.ctx
      this.ctx = null
      void ctx.close().catch(() => {})
    }
    this.categories = null
  }

  // --- テスト/デバッグ用アクセサ(AudioContext の状態確認に) ---
  /** 現在の AudioContext 状態(未生成なら 'closed' 相当の null)。 */
  get contextState(): AudioContextState | null {
    return this.ctx?.state ?? null
  }
}
