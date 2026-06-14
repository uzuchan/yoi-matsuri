/**
 * スーパーボールすくいセッション(MINIGAME_ARCHETYPES 原型A SCOOP / 屋台#1)。
 *
 * three / react / DOM 非依存の純TS(D-003)。StallSession 契約(game/stall)を実装し、
 * update(dt, input)→Event[] / snapshot()→State / status / result() を提供する。
 *
 * **金魚すくいのポイ物理を再利用**: game/goldfish/poi.ts の Poi クラスをそのまま使う
 * (カーソル慣性追従・水中時定数×waterDragFactor・紙耐久=水中滞在+speed²+持ち上げ荷重・破損=失敗)。
 * 金魚すくい(game/goldfish)は無改修。SCOOP の "そっとすくう/速いと破れる" 手触りを共有する。
 *
 * 金魚との差(§2 #1):
 *  - 対象は逃げない「ゆらゆら漂うスーパーボール」(Ball: bob/drift)。
 *  - 確保がやや軽く、数を要求(tier 境界を高める = Definition の resultRules 側)。
 *  - secured(お椀へ確保した数)が score。
 */
import { Poi, SeededRandom, type PoiState, type TankBounds, type Vec2 } from '../goldfish'
import type { StallResult, StallSession, StallSnapshot } from '../stall'
import { Ball, type BallState } from './ball'
import {
  DEFAULT_SUPERBALL_PARAMS,
  SUPERBALL_COLORS,
  SUPERBALL_PAPER_WARNING_THRESHOLD,
  SUPERBALL_POI_PARAMS,
  SUPERBALL_TANK_BOUNDS,
  type SuperballParams,
} from './params'

/** 1 フレームの操作入力(シーンが InputManager/ポインタから組み立てて渡す)。金魚と同型。 */
export interface SuperballInput {
  /** ポイの追従目標(カーソルの水面投影)[m]。 */
  readonly target: Vec2
  /** 沈めているか(押下=true で水中、解放=false で持ち上げ)。 */
  readonly submerge: boolean
  /** 確保の意図(お椀の上で確定)。true でポイに乗っているボールをお椀へ確保する。 */
  readonly secure?: boolean
  /** 退出要求(Esc)。true で status=quit となり終了する。 */
  readonly quit?: boolean
}

/**
 * update が返す状態変化記述子(EventBus 非依存)。StallCommonEvent('stall-finished')と
 * 屋台固有イベントのユニオン(StallFramework §1.3)。シーンが eventMap で sfx/stall:finished へ写像する。
 */
export type SuperballEvent =
  /** 捕獲成立(ポイへ乗った)。→ sfx 'catch'。 */
  | { readonly type: 'caught'; readonly total: number; readonly ballId: number }
  /** お椀へ確保。→ sfx 'secure'。 */
  | { readonly type: 'secured'; readonly secured: number; readonly ballId: number }
  /** ボールがこぼれる(持ち上げ速度超過)。→ sfx 'fish-escape'(汎用すくい音を流用)。 */
  | { readonly type: 'ball-spill'; readonly ballId: number }
  /** 耐久 30 以下に初めて到達。→ sfx 'paper-warning'。 */
  | { readonly type: 'paper-warning' }
  /** ポイ破損。→ sfx 'paper-tear'。 */
  | { readonly type: 'poi-torn' }
  /** セッション終了。score=確保数 / reason は屋台横断の語彙。 */
  | { readonly type: 'stall-finished'; readonly result: StallResult }

/** セッションの公開状態(描画/HUD が読む)。StallSnapshot を満たす。 */
export interface SuperballState extends StallSnapshot {
  /** ポイの状態(位置・耐久・水中など)。 */
  readonly poi: PoiState
  /** 全ボールの状態(描画対応用に id 付き)。 */
  readonly balls: readonly BallState[]
  /** お椀へ確保した数(= score)。 */
  readonly secured: number
  /** 累計捕獲数(こぼす前に何度すくえたか。演出用)。 */
  readonly caughtTotal: number
}

/** セッション生成オプション。 */
export interface SuperballOptions {
  readonly params?: SuperballParams
  readonly bounds?: TankBounds
  /** 乱数シード(ボール配置/漂いの決定論化。既定 1)。 */
  readonly seed?: number
}

/**
 * スーパーボールすくいセッション。固定タイムステップ(GameLoop の dt)で update される。
 */
export class SuperballSession
  implements StallSession<SuperballInput, SuperballState, SuperballEvent>
{
  private readonly params: SuperballParams
  private readonly bounds: TankBounds
  private readonly rng: SeededRandom

  private readonly poi: Poi
  private readonly balls: Ball[]

  private internalStatus: StallSnapshot['status'] = 'playing'
  private timeRemaining: number
  private secured = 0
  private caughtTotal = 0
  private warned = false
  private prevSubmerged = false
  private finalResult: StallResult | null = null

  constructor(options: SuperballOptions = {}) {
    this.params = options.params ?? DEFAULT_SUPERBALL_PARAMS
    this.bounds = options.bounds ?? SUPERBALL_TANK_BOUNDS
    this.rng = new SeededRandom(options.seed ?? 1)
    this.timeRemaining = this.params.sessionTimeLimit

    // ポイ物理は金魚の Poi を再利用(屋台向けの値だけ差し替え)。
    this.poi = new Poi(SUPERBALL_POI_PARAMS, { x: 0, z: 0 })
    this.balls = []
    for (let i = 0; i < this.params.ballCount; i++) {
      const start = this.randomTankPoint()
      const colorIndex = i % SUPERBALL_COLORS.length
      this.balls.push(new Ball(i, colorIndex, this.params, this.bounds, this.rng, start))
    }
  }

  get status(): StallSnapshot['status'] {
    return this.internalStatus
  }

  result(): StallResult | null {
    return this.finalResult
  }

  update(dt: number, input: SuperballInput): readonly SuperballEvent[] {
    if (this.internalStatus !== 'playing') return []

    const events: SuperballEvent[] = []

    // 0) 退出。
    if (input.quit) {
      this.finish('quit', events)
      return events
    }

    // 1) ポイ物理(金魚と同じ慣性追従・耐久)。
    this.poi.setTarget(input.target)
    this.poi.setSubmerged(input.submerge)
    this.poi.update(dt)

    // 2) ポイに乗っているボールはポイへ追従。
    const poiPos = this.poi.position
    for (const ball of this.balls) {
      if (ball.currentStatus === 'onPoi') ball.followPoi(poiPos)
    }

    // 3) 持ち上げエッジ(submerged→不submerged)で捕獲判定。
    const lifted = this.prevSubmerged && !input.submerge
    if (lifted) this.resolveCapture(events)

    // 4) 確保(お椀へ)。
    if (input.secure) this.resolveSecure(events)

    // 5) ボール AI(漂い・弾み。逃げない)。
    for (const ball of this.balls) ball.update(dt)

    // 6) 耐久警告(残30以下・初回)。
    const dur = this.poi.remainingDurability
    if (!this.warned && dur <= SUPERBALL_PAPER_WARNING_THRESHOLD && dur > 0) {
      this.warned = true
      events.push({ type: 'paper-warning' })
    }

    // 7) 破損判定(耐久0 → 失敗即終了。乗っていたボールは水面へ戻す)。
    if (this.poi.isTorn) {
      events.push({ type: 'poi-torn' })
      for (const ball of this.balls) {
        if (ball.currentStatus === 'onPoi') ball.returnToTank()
      }
      this.finish('broke', events)
      this.prevSubmerged = input.submerge
      return events
    }

    // 8) 残時間カウントダウン。
    this.timeRemaining = Math.max(0, this.timeRemaining - dt)
    if (this.timeRemaining <= 0) this.finish('timeout', events)

    this.prevSubmerged = input.submerge
    return events
  }

  /** 持ち上げ時の捕獲/こぼれ判定(SCOOP: 速度≤liftSpeedMax かつポイ円内で確保)。 */
  private resolveCapture(events: SuperballEvent[]): void {
    const poiPos = this.poi.position
    const speed = this.poi.horizontalSpeed
    const speedOk = speed <= this.params.liftSpeedMax

    const inCircle = this.balls.filter(
      (b) => b.currentStatus === 'floating' && b.distanceTo(poiPos) <= this.params.poiRadius,
    )
    if (inCircle.length === 0) return

    if (!speedOk) {
      // 速く動かすとこぼれる(SCOOP の手触り: そっとすくう)。耐久ダメージは無し(金魚と同方針)。
      for (const ball of inCircle) {
        ball.returnToTank()
        events.push({ type: 'ball-spill', ballId: ball.id })
      }
      return
    }

    // 捕獲成立: ポイへ乗せ、荷重ダメージを 1 回適用(ボールは軽い fishWeightDamage=8pt)。
    for (const ball of inCircle) {
      ball.setOnPoi()
      this.caughtTotal += 1
      this.poi.applyFishWeightDamage()
      events.push({ type: 'caught', total: this.caughtTotal, ballId: ball.id })
    }
  }

  /** ポイに乗っているボールをお椀へ確保する。 */
  private resolveSecure(events: SuperballEvent[]): void {
    for (const ball of this.balls) {
      if (ball.currentStatus === 'onPoi') {
        ball.setSecured()
        this.secured += 1
        events.push({ type: 'secured', secured: this.secured, ballId: ball.id })
      }
    }
  }

  /** セッションを終了させる(status + StallResult + stall-finished)。 */
  private finish(reason: 'broke' | 'timeout' | 'quit', events: SuperballEvent[]): void {
    if (reason === 'timeout') {
      this.internalStatus = this.secured > 0 ? 'cleared' : 'timeout'
    } else if (reason === 'quit') {
      this.internalStatus = 'quit'
    } else {
      this.internalStatus = 'failed'
    }
    this.finalResult = { score: this.secured, reason }
    events.push({ type: 'stall-finished', result: this.finalResult })
  }

  /** 楕円水槽内のランダムな点(初期配置用, 決定論的)。 */
  private randomTankPoint(): Vec2 {
    const a = this.rng.range(0, Math.PI * 2)
    const r = Math.sqrt(this.rng.next()) * 0.8
    return {
      x: Math.cos(a) * r * this.bounds.radiusX,
      z: Math.sin(a) * r * this.bounds.radiusZ,
    }
  }

  snapshot(): SuperballState {
    const dur = this.poi.snapshot()
    return {
      status: this.internalStatus,
      timeRemaining: this.timeRemaining,
      // 危険度 = ポイ耐久の逆(1 で最危険 = 破損間際)。汎用 HUD/警告に使う(StallSnapshot 契約)。
      danger: 1 - dur.durabilityRatio,
      score: this.secured,
      poi: dur,
      balls: this.balls.map((b) => b.snapshot()),
      secured: this.secured,
      caughtTotal: this.caughtTotal,
    }
  }
}
