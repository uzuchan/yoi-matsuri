/**
 * 金魚すくいセッションの進行(GDD §4.4 / §4.5 / §5)。
 *
 * three / react / DOM 非依存の純TS(D-003)。update(dt, input) の単一 API で進行し、
 * 公開状態(ポイ・金魚配列・確保数・残時間・status)を T-006(描画/HUD)へ提供する。
 *
 * 状態変化(捕獲・確保・金魚逃げ・耐久警告・破損・終了)は GoldfishEvent[] として update の
 * 戻り値で表現する(本タスクでは EventBus 発火配線はしない。T-006/音響が拾える記述子の生成まで。
 * GameEvents goldfish:caught / goldfish:poi-torn / goldfish:finished と AUDIO_SPEC §4 に対応)。
 */
import {
  DEFAULT_GOLDFISH_PARAMS,
  DEFAULT_TANK_BOUNDS,
  PAPER_WARNING_THRESHOLD,
  type GoldfishParams,
  type TankBounds,
} from './params'
import { Fish, type FishState } from './fish'
import { Poi, type PoiState, type Vec2 } from './poi'
import { SeededRandom } from './rng'

/** セッションの状態。 */
export type SessionStatus = 'playing' | 'won' | 'torn' | 'timeout' | 'quit'

/** 1 フレームの操作入力(T-006 が InputManager/ポインタから組み立てて渡す)。 */
export interface GoldfishInput {
  /** ポイの追従目標(カーソルの水面投影)[m]。 */
  readonly target: Vec2
  /** 沈めているか(押下=true で水中、解放=false で持ち上げ)。 */
  readonly submerge: boolean
  /**
   * 確保の意図(お椀の上で再度沈める=クリックの立ち上がり等。T-006 がエッジを判定して渡す)。
   * true のとき、ポイに乗っている金魚をお椀へ確保する(GDD §4.2 手順4)。
   */
  readonly secure?: boolean
  /** 退出要求(プレイヤーが途中でやめる)。true で status=quit となり終了する。 */
  readonly quit?: boolean
}

/**
 * update が返す状態変化の記述子(EventBus 非依存)。
 * T-006/音響がこれを GameEvents / sfx:play へ写像する。
 */
export type GoldfishEvent =
  /** 捕獲成立。total=累計捕獲数。→ goldfish:caught / sfx 'catch'。 */
  | { readonly type: 'caught'; readonly total: number; readonly fishId: number }
  /** お椀へ確保。secured=確保数。→ sfx 'secure'。 */
  | { readonly type: 'secured'; readonly secured: number; readonly fishId: number }
  /** 金魚がこぼれる/逃げる(持ち上げ速度超過 等)。→ sfx 'fish-escape'。 */
  | { readonly type: 'fish-escape'; readonly fishId: number }
  /** 耐久 30 以下に初めて到達。→ sfx 'paper-warning'。 */
  | { readonly type: 'paper-warning' }
  /** ポイ破損。→ goldfish:poi-torn / sfx 'paper-tear'。 */
  | { readonly type: 'poi-torn' }
  /** セッション終了。→ goldfish:finished。caught=確保数(記録値, GDD §4.4)。 */
  | {
      readonly type: 'finished'
      readonly reason: 'torn' | 'timeout' | 'quit'
      readonly caught: number
    }

/** セッションの公開状態スナップショット(T-006 描画/HUD が読む)。 */
export interface SessionState {
  readonly status: SessionStatus
  /** 残り時間 [s]。 */
  readonly timeRemaining: number
  /** ポイの状態(位置・耐久・水中など)。 */
  readonly poi: PoiState
  /** 全金魚の状態(描画対応用に id 付き)。 */
  readonly fish: readonly FishState[]
  /** お椀へ確保した数(GDD §4.4 の記録値=結果の捕獲数)。 */
  readonly secured: number
  /** 累計捕獲数(こぼす前に何度すくえたか。HUD/演出用)。 */
  readonly caughtTotal: number
}

/** セッション生成オプション。 */
export interface SessionOptions {
  /** 物理/ルールパラメータ(既定は GDD §4.3)。 */
  readonly params?: GoldfishParams
  /** 水槽寸法(既定は GDD §4.1 相当)。 */
  readonly bounds?: TankBounds
  /** 乱数シード(金魚配置/AI の決定論化。既定 1)。 */
  readonly seed?: number
}

/**
 * 金魚すくいセッション。固定タイムステップ(GameLoop の dt)で update される想定。
 */
export class GoldfishSession {
  private readonly params: GoldfishParams
  private readonly bounds: TankBounds
  private readonly rng: SeededRandom

  private readonly poi: Poi
  private readonly fishes: Fish[]

  private status: SessionStatus = 'playing'
  private timeRemaining: number
  private secured = 0
  private caughtTotal = 0
  /** 耐久警告(残30以下)を一度でも出したか(初回のみ発火, AUDIO_SPEC §4)。 */
  private warned = false
  /** 直前フレームの submerge 状態(lift エッジ=true→false の検出)。 */
  private prevSubmerged = false

  constructor(options: SessionOptions = {}) {
    this.params = options.params ?? DEFAULT_GOLDFISH_PARAMS
    this.bounds = options.bounds ?? DEFAULT_TANK_BOUNDS
    this.rng = new SeededRandom(options.seed ?? 1)
    this.timeRemaining = this.params.sessionTimeLimit

    this.poi = new Poi(this.params, { x: 0, z: 0 })
    this.fishes = []
    for (let i = 0; i < this.params.fishCount; i++) {
      const start = this.randomTankPoint()
      this.fishes.push(new Fish(i, this.params, this.bounds, this.rng, start))
    }
  }

  /**
   * セッションを 1 ステップ進める。
   * @returns このステップで発生した状態変化の記述子(EventBus 非依存)。
   */
  update(dt: number, input: GoldfishInput): readonly GoldfishEvent[] {
    if (this.status !== 'playing') return []

    const events: GoldfishEvent[] = []

    // 0) 退出要求。
    if (input.quit) {
      this.finish('quit', events)
      return events
    }

    // 1) ポイ物理(目標・水中状態を反映して 1 ステップ)。
    this.poi.setTarget(input.target)
    this.poi.setSubmerged(input.submerge)
    this.poi.update(dt)

    // 2) ポイに乗っている金魚はポイへ追従させる。
    const poiPos = this.poi.position
    for (const fish of this.fishes) {
      if (fish.currentStatus === 'onPoi') fish.followPoi(poiPos)
    }

    // 3) 持ち上げエッジ(submerged→不submerged)で捕獲判定(GDD §4.5)。
    const lifted = this.prevSubmerged && !input.submerge
    if (lifted) {
      this.resolveCapture(events)
    }

    // 4) 確保(お椀へ)。ポイに乗っている金魚を確保する。
    if (input.secure) {
      this.resolveSecure(events)
    }

    // 5) 金魚 AI(泳ぎ・逃避)。onPoi/secured は update 内で無視される。
    const submerged = this.poi.isSubmerged
    for (const fish of this.fishes) {
      fish.update(dt, poiPos, submerged)
    }

    // 6) 耐久警告(残30以下・初回)。
    if (!this.warned && this.poi.remainingDurability <= PAPER_WARNING_THRESHOLD && this.poi.remainingDurability > 0) {
      this.warned = true
      events.push({ type: 'paper-warning' })
    }

    // 7) 破損判定(耐久0 → torn 即終了。載っていた金魚は水槽へ戻す, GDD §4.4)。
    if (this.poi.isTorn) {
      events.push({ type: 'poi-torn' })
      for (const fish of this.fishes) {
        if (fish.currentStatus === 'onPoi') fish.returnToTank()
      }
      this.finish('torn', events)
      this.prevSubmerged = input.submerge
      return events
    }

    // 8) 残時間カウントダウン(時間切れ → timeout)。
    this.timeRemaining = Math.max(0, this.timeRemaining - dt)
    if (this.timeRemaining <= 0) {
      this.finish('timeout', events)
    }

    this.prevSubmerged = input.submerge
    return events
  }

  /** 持ち上げ時の捕獲/失敗判定(GDD §4.5)。 */
  private resolveCapture(events: GoldfishEvent[]): void {
    const poiPos = this.poi.position
    const speed = this.poi.horizontalSpeed
    const speedOk = speed <= this.params.liftSpeedMax

    // ポイ円内にいる swimming の金魚を対象にする。
    const inCircle = this.fishes.filter(
      (f) => f.currentStatus === 'swimming' && f.distanceTo(poiPos) <= this.params.poiRadius,
    )
    if (inCircle.length === 0) return

    if (!speedOk) {
      // 速度超過: すべて逃げる(捕獲失敗・耐久ダメージ無し, GDD §4.5)。
      for (const fish of inCircle) {
        fish.returnToTank()
        events.push({ type: 'fish-escape', fishId: fish.id })
      }
      return
    }

    // 捕獲成立: ポイへ乗せ、金魚荷重ダメージを 1 回適用(GDD §4.3)。
    for (const fish of inCircle) {
      fish.setOnPoi()
      this.caughtTotal += 1
      this.poi.applyFishWeightDamage()
      events.push({ type: 'caught', total: this.caughtTotal, fishId: fish.id })
    }
  }

  /** ポイに乗っている金魚をお椀へ確保する(GDD §4.2 手順4)。 */
  private resolveSecure(events: GoldfishEvent[]): void {
    for (const fish of this.fishes) {
      if (fish.currentStatus === 'onPoi') {
        fish.setSecured()
        this.secured += 1
        events.push({ type: 'secured', secured: this.secured, fishId: fish.id })
      }
    }
  }

  /** セッションを終了させる(status 設定 + finished イベント)。 */
  private finish(reason: 'torn' | 'timeout' | 'quit', events: GoldfishEvent[]): void {
    // status: 確保数>0 かつ time/quit 終了は won、それ以外は終了理由を採る。
    if (reason === 'timeout') {
      this.status = this.secured > 0 ? 'won' : 'timeout'
    } else if (reason === 'quit') {
      this.status = 'quit'
    } else {
      this.status = 'torn'
    }
    events.push({ type: 'finished', reason, caught: this.secured })
  }

  /** 楕円水槽内のランダムな点(初期配置用, 決定論的)。 */
  private randomTankPoint(): Vec2 {
    const a = this.rng.range(0, Math.PI * 2)
    const r = Math.sqrt(this.rng.next()) * 0.85
    return {
      x: Math.cos(a) * r * this.bounds.radiusX,
      z: Math.sin(a) * r * this.bounds.radiusZ,
    }
  }

  // --- 公開状態(T-006 描画/HUD 用) ---

  get currentStatus(): SessionStatus {
    return this.status
  }

  get timeLeft(): number {
    return this.timeRemaining
  }

  get securedCount(): number {
    return this.secured
  }

  get totalCaught(): number {
    return this.caughtTotal
  }

  /** ポイの公開状態。 */
  get poiState(): PoiState {
    return this.poi.snapshot()
  }

  /** 全金魚の公開状態。 */
  get fishStates(): readonly FishState[] {
    return this.fishes.map((f) => f.snapshot())
  }

  /** セッション全体の公開状態スナップショット。 */
  snapshot(): SessionState {
    return {
      status: this.status,
      timeRemaining: this.timeRemaining,
      poi: this.poi.snapshot(),
      fish: this.fishes.map((f) => f.snapshot()),
      secured: this.secured,
      caughtTotal: this.caughtTotal,
    }
  }
}
