import {
  FogExp2,
  PerspectiveCamera,
  Scene as ThreeScene,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three'
import type { Scene, SceneContext } from '../../core/SceneManager'
import type { EventBus } from '../../core/EventBus'
import type { InputManager } from '../../core/InputManager'
import type { StallPlacement } from '../stall'
import {
  APPROACH,
  PALETTE,
  STALL_ID,
  STALL_POSITION,
  WALK_BOUNDS,
  computeCrowdPlacements,
  computeFestivalStallPlacements,
  computeLanternAnchors,
  createCrowd,
  createFestivalStalls,
  createFireworks,
  createGround,
  createLanterns,
  createLighting,
  createPlayer,
  createPromptLabel,
  createSky,
  createStall,
  createTorii,
  FireworksTimer,
  FootstepCadence,
  integrateMovement,
  keyboardMoveVector,
  mouseForwardVector,
  pickRepresentativeLanterns,
  ProximityTracker,
  INTERACT_RADIUS,
  walkBobOffset,
  type ContactCircle,
  type FireworkColor,
  type FireworksObject,
  type PromptLabel,
  type Vec2,
  type Vec3,
  type WorldObject,
} from '../../world'

// ART_DIRECTION §4 フォグ
const FOG_DENSITY = 0.028

// ART_DIRECTION §5 カメラ(approach: プレイヤー後方5m・高さ3.2m・俯角15°・FOV 55°・追従lag0.15s)
const CAMERA_FOV = 55
const CAMERA_BACK_DISTANCE = 5 // プレイヤー後方(+Z方向)5m
const CAMERA_HEIGHT = 3.2
const CAMERA_PITCH_DEG = -15
const CAMERA_LAG = 0.15 // 追従の時定数(秒)

// マウス移動による視線の追従量(INTERACTION_SPEC §3.1: ±5°程度)。
const LOOK_YAW_MAX_DEG = 5

// マウスのみ前進(INTERACTION_SPEC §3.1)の屋台方向への収束係数(0..1)。
// 押下中のみ適用しキーボード移動とは干渉しない(Risk 1)。
// まっすぐ前進(-Z)を主としつつ屋台(中腹右側 x=+5)へ緩やかに寄せ、
// キーボード無しでも近接圏 3m へ確実に入れる強さ。値は報告に明記。
const MOUSE_CONVERGE = 0.35

// 提灯PointLightの代表灯数(ART §4: 4灯まで)。
const LANTERN_LIGHT_COUNT = 4

// プレイヤーの初期位置(参道入口付近の中心線)。
const PLAYER_START: Vec2 = { x: 0, z: 4 }

// プロンプトラベルの高さ(屋台のカウンターより上、視線に入る位置)。
const PROMPT_LABEL_Y = 2.0

/**
 * 参道シーン(T-003)。T-002 の世界(夜空・フォグ・地面・提灯列・鳥居・屋台・群衆・ライティング)に、
 * プレイヤー・三人称追従カメラ・キーボード/マウス両対応の移動・屋台への近接判定と
 * 「E: 屋台をのぞく」プロンプトを載せる。
 *
 * - 追従カメラ: ART §5(後方5m・高さ3.2m・俯角15°・lag0.15s・FOV55°)。
 * - 移動: WASD/矢印(walkSpeed 3.0m/s、dtベース)。world/movement の純TSロジックで積分+クランプ。
 * - マウスのみ: 左ボタン押下中に前進し屋台方向へ緩やかに収束(キーボード不要で近接圏へ到達可)。
 * - 近接: STALL_POSITION から 3m 以内で stall:approach、離脱で stall:leave を各1回発火
 *   (world/proximity の ProximityTracker がエッジ判定。連続発火しない)。
 *
 * E押下 → 会話遷移は意図的に T-004(gameplay-engineer)へ繰り延べる。
 * 本シーンでは E に遷移を割り当てない(ダミーの会話画面・未接続画面を作らない)。AC8。
 *
 * GPUリソースは dispose() で全解放する(idempotent)。update 内でフレーム毎の new を行わない
 * (ワーク変数 #player / #desiredCamPos / #lookTarget を再利用)。
 */
export class ApproachScene implements Scene {
  readonly id = 'approach' as const

  private readonly renderer: WebGLRenderer
  private readonly scene: ThreeScene
  private readonly camera: PerspectiveCamera

  /** 構築した全 WorldObject。update / dispose をまとめて駆動する。 */
  private readonly worldObjects: WorldObject[]
  /** update を持つ WorldObject のみ(揺れ・フェード等)。毎フレームのフィルタリングを避けるため事前抽出。 */
  private readonly animated: WorldObject[]
  private disposed = false

  // --- T-003 のランタイム状態 ---
  private readonly player: WorldObject
  private readonly prompt: PromptLabel
  private readonly fireworks: FireworksObject
  /**
   * 屋台ごとの近接トラッカー(StallFramework §4.2 / D-010)。各屋台 placement に対し1個ずつ持ち、
   * enter/leave エッジを stall:approach{stallId}/stall:leave{stallId} で発火する。
   * 既定では金魚すくい1軒(setStallPlacements 未呼び出し時の後方互換)。
   */
  private stallTrackers: { stallId: string; placement: StallPlacement; tracker: ProximityTracker }[] = [
    {
      stallId: STALL_ID,
      placement: {
        position: { x: STALL_POSITION.x, z: STALL_POSITION.z },
        facing: -Math.PI / 2,
        interactRadius: INTERACT_RADIUS,
        promptY: PROMPT_LABEL_Y,
      },
      tracker: new ProximityTracker(INTERACT_RADIUS),
    },
  ]
  /** 現在近接中の屋台 id(なければ null)。E/クリック遷移と prompt の対象。 */
  private nearStallId: string | null = null

  // --- T-009: 花火タイマー / 足音 / 歩行ボブ ---
  /** 花火の打ち上げタイマー(初回〜10s、以降30〜45s間隔)。 */
  private readonly fireworksTimer = new FireworksTimer()
  /** 足音 0.45s 間隔(移動中のみ。INTERACTION_SPEC §4)。 */
  private readonly footsteps = new FootstepCadence()
  /** 歩行ボブの位相累積秒(移動中のみ進める)。 */
  private bobPhase = 0
  /** 歩行ボブの強さ 0..1(移動で1、停止で0へ減衰。酔い防止のため緩やかに)。 */
  private bobIntensity = 0
  /** 直近フレームでプレイヤーが移動したか(footstep / bob 判定用)。 */
  private movedThisFrame = false
  /** プレイヤーの水平位置(world座標)。three の Vector ではなく純データで保持。 */
  private readonly playerPos: Vec2 = { x: PLAYER_START.x, z: PLAYER_START.z }
  /** マウス移動由来の視線ヨー(ラジアン)。±LOOK_YAW_MAX。 */
  private lookYaw = 0

  // enter(ctx) で受け取る core ハンドル(固定カメラ時は未使用だった)。
  private events: EventBus | null = null
  private input: InputManager | null = null

  // update 内で再利用するワーク変数(フレーム毎アロケーション回避)。
  private readonly desiredCamPos = new Vector3()
  private readonly lookTarget = new Vector3()

  // --- T-004: 近接中の E/左クリック → 会話(dialogue)遷移の配線 ---
  /** E キーの立ち上がりエッジ検出用(前フレーム押下状態)。 */
  private prevInteractDown = false
  /** マウス左ボタンの立ち上がりエッジ検出用(前フレーム押下状態)。 */
  private prevMousePressed = false
  /**
   * 会話シーンへの遷移ハンドラ。App.tsx(合成点)が SceneManager.transition('dialogue', payload) を
   * 束縛して注入する。Scene は SceneManager を直接参照しない core 設計(DialogueScene と同方式)。
   * payload で近接中の stallId を運ぶ(StallFramework §4.4)。
   */
  private transitionHandler: ((to: 'dialogue', payload?: unknown) => void) | null = null

  /** App.tsx(合成点)から会話遷移ハンドラを注入する(T-004 / 多屋台 §4.4)。 */
  setTransitionHandler(handler: (to: 'dialogue', payload?: unknown) => void): void {
    this.transitionHandler = handler
  }

  /**
   * 合成点(App.tsx)から全屋台の placement を注入する(StallFramework §4.2)。
   * 各 placement に近接トラッカーを1個ずつ持ち、全屋台に対し enter/leave を判定する。
   * 未呼び出し時は既定の金魚すくい1軒(constructor の初期値)で動く(後方互換)。
   */
  setStallPlacements(
    stalls: readonly { stallId: string; displayName: string; placement: StallPlacement }[],
  ): void {
    if (stalls.length === 0) return
    this.stallTrackers = stalls.map((s) => ({
      stallId: s.stallId,
      placement: s.placement,
      tracker: new ProximityTracker(s.placement.interactRadius),
    }))
    this.nearStallId = null
  }

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.scene = new ThreeScene()
    this.scene.fog = new FogExp2(PALETTE.fog, FOG_DENSITY)

    const size = renderer.getSize(new Vector2())
    const aspect = size.y > 0 ? size.x / size.y : 1
    this.camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 400)

    // --- 配置計算(決定論的) ---
    const lanternAnchors = computeLanternAnchors()
    const lanternLightAnchors = pickRepresentativeLanterns(lanternAnchors, LANTERN_LIGHT_COUNT)

    // --- world ビルダー群 ---
    const sky = createSky()
    const ground = createGround(this.buildContactCircles())
    const lanterns = createLanterns()
    const torii = createTorii()
    const stall = createStall()
    // 参道の賑わい(T-012): 縁日屋台 約19軒(装飾・非インタラクティブ)。既存の金魚すくい屋台
    // (stall)はそのまま残し、これと合わせて約20軒に見せる。近接プロンプトは金魚すくいのみ。
    const festivalStalls = createFestivalStalls()
    const crowd = createCrowd()
    const lighting = createLighting(lanternLightAnchors)
    this.player = createPlayer()

    // 花火(T-009)。launch/burst のコールバックを EventBus へ橋渡しする(視覚と音の同期)。
    // 発火責任は scenes/approach(AC2)。audio は fireworks:launch/burst を購読して鳴らす。
    this.fireworks = createFireworks({
      onLaunch: (color, position) => this.emitFirework('fireworks:launch', color, position),
      onBurst: (color, position) => this.emitFirework('fireworks:burst', color, position),
    })

    // プロンプトラベルは屋台のやや参道中心寄り・カウンター上に置く(開口側=-x方向)。
    this.prompt = createPromptLabel({
      x: STALL_POSITION.x - 1.2,
      y: PROMPT_LABEL_Y,
      z: STALL_POSITION.z,
    })

    this.worldObjects = [
      sky,
      ground,
      lighting,
      lanterns,
      torii,
      stall,
      festivalStalls,
      crowd,
      this.fireworks,
      this.player,
      this.prompt,
    ]
    for (const w of this.worldObjects) {
      this.scene.add(w.object)
    }
    this.animated = this.worldObjects.filter((w) => typeof w.update === 'function')

    // プレイヤーを初期位置へ。カメラも初期フレームから正しい後方位置に置く(lag のスナップ防止)。
    this.player.object.position.set(this.playerPos.x, 0, this.playerPos.z)
    this.snapCameraToPlayer()
  }

  enter(ctx: SceneContext): void {
    // 追従カメラ・移動・近接判定は ctx.input / ctx.events を使う(T-002 までは固定カメラで未使用)。
    this.events = ctx.events
    this.input = ctx.input
    // 再入場に備えて状態をリセットする(プロンプト非表示・近接圏外・視線正面)。
    for (const s of this.stallTrackers) s.tracker.reset()
    this.prompt.setVisible(false)
    this.lookYaw = 0
    this.nearStallId = null
    // 歩行ボブ・足音の状態は再入場時にリセット(会話復帰直後に1歩鳴らさない)。
    this.bobIntensity = 0
    this.movedThisFrame = false
    // 会話から approach へ戻った直後に、まだ押されている E/クリックを誤って
    // 再遷移に拾わないよう、エッジ基準を現在の押下状態へ揃える(立ち上がりのみ反応)。
    this.prevInteractDown = ctx.input.isDown('KeyE')
    this.prevMousePressed = ctx.input.mouse.pressed
  }

  exit(): void {
    // INTERACTION_SPEC §3.2: 会話(dialogue)へ遷移すると DialogueScene が本シーンの world を
    // 背景描画するが、本シーンの update は回らないためプロンプトのフェードが進まない。
    // exit 時に近接プロンプトを即時非表示にして、会話UIと重ならないようにする
    // (屋台・店主・提灯などのワールド造形はそのまま見え続ける。プロンプトのみ消す)。
    // approach 復帰時は enter() で再び非表示状態へリセットし、近接判定で再表示する。
    this.prompt.setVisible(false, true)
    // シーンは常駐し再入場可能。入力ハンドルは enter で取り直す。GPU解放は dispose で行う。
    this.events = null
    this.input = null
  }

  update(dt: number): void {
    this.updatePlayer(dt)
    this.updateProximity()
    this.updateAtmosphere(dt)
    this.updateCamera(dt)

    // 提灯・群衆の揺れ・花火・プロンプトのフェードなど動的要素を駆動。
    for (const w of this.animated) {
      w.update?.(dt)
    }
  }

  /**
   * T-009 雰囲気演出の駆動: 花火タイマー / 足音 / 歩行ボブの位相・強さ。
   * 花火の launch/burst は fireworks 内部のコールバック経由で EventBus へ発火する(emitFirework)。
   */
  private updateAtmosphere(dt: number): void {
    // 花火: タイマーが満ちたら1発打ち上げる(初回〜10s、以降30〜45s間隔)。
    if (this.fireworksTimer.tick(dt)) {
      this.fireworks.launchOne(this.fireworksTimer.lastSeed)
    }

    // 足音: 移動中のみ 0.45s 間隔で sfx:play{footstep}(INTERACTION_SPEC §4)。
    if (this.footsteps.tick(dt, this.movedThisFrame)) {
      this.events?.emit('sfx:play', { name: 'footstep' })
    }

    // 歩行ボブの位相・強さ: 移動中は位相を進め強さを1へ、停止で0へ緩やかに減衰(酔い防止)。
    if (this.movedThisFrame) {
      this.bobPhase += dt
      this.bobIntensity = Math.min(1, this.bobIntensity + dt / 0.12)
    } else {
      this.bobIntensity = Math.max(0, this.bobIntensity - dt / 0.18)
    }
  }

  /** 花火 launch/burst を EventBus へ橋渡しする(three 非依存のプレーンペイロード)。 */
  private emitFirework(
    event: 'fireworks:launch' | 'fireworks:burst',
    color: FireworkColor,
    position: Vec3,
  ): void {
    this.events?.emit(event, {
      color,
      position: { x: position.x, y: position.y, z: position.z },
    })
  }

  render(_alpha: number): void {
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * 本シーンの world(屋台・店主・提灯など)を、外部から渡された任意のカメラで描画する読み取り専用
   * ヘルパ(Lead 承認の最小スコープ例外 / REV-T-007-1 Major-2)。
   *
   * 用途: ResultScene が approach の world を「result 専用固定カメラ」で描くため(ART §5 result:
   * 屋台正面・店主中央)。本シーンの追従カメラ・update・dispose・既存挙動には一切触れない。
   * scene / world の所有は ApproachScene のまま(world 二重生成をしない)。レンダリングのみ行う。
   */
  renderWith(camera: PerspectiveCamera): void {
    this.renderer.render(this.scene, camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = height > 0 ? width / height : 1
    this.camera.updateProjectionMatrix()
  }

  /**
   * 全 GPU リソースを解放する。複数回呼んでも安全(idempotent)。
   * 各 WorldObject の dispose を呼び、シーングラフからも外す。
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const w of this.worldObjects) {
      this.scene.remove(w.object)
      w.dispose()
    }
    this.scene.fog = null
    this.events = null
    this.input = null
  }

  // --- 移動 ---

  /**
   * キーボード(WASD/矢印)とマウス(左ボタン押下中の前進+屋台方向収束)で
   * プレイヤー位置を更新する。world/movement の純TSロジックで積分+クランプ。
   * 両入力は加算されず、移動方向ベクトルとして合成してから 1 回だけ積分する
   * (対角線でも walkSpeed を超えない / マウス収束はキーボードと干渉しない)。
   */
  private updatePlayer(dt: number): void {
    const input = this.input
    if (!input) return

    // キーボード移動方向。
    const kb = keyboardMoveVector({
      forward: input.isDown('KeyW') || input.isDown('ArrowUp'),
      back: input.isDown('KeyS') || input.isDown('ArrowDown'),
      left: input.isDown('KeyA') || input.isDown('ArrowLeft'),
      right: input.isDown('KeyD') || input.isDown('ArrowRight'),
    })

    let moveX = kb.x
    let moveZ = kb.z

    // マウスのみ前進(押下中)。キーボード入力が無いときに屋台方向へ収束する前進を提供する。
    // キーボードと同時の場合はキーボードを優先し、マウス収束は適用しない(Risk 1: 干渉回避)。
    if (input.mouse.pressed && moveX === 0 && moveZ === 0) {
      const fwd = mouseForwardVector(this.playerPos, STALL_POSITION, MOUSE_CONVERGE)
      moveX = fwd.x
      moveZ = fwd.z
    }

    const prevX = this.playerPos.x
    const prevZ = this.playerPos.z
    const next = integrateMovement(this.playerPos, { x: moveX, z: moveZ }, dt, undefined, WALK_BOUNDS)
    this.playerPos.x = next.x
    this.playerPos.z = next.z
    this.player.object.position.set(next.x, 0, next.z)

    // 実際に位置が動いたか(壁際でクランプされ移動入力があっても進めない場合は「停止」扱い)。
    // これを足音・歩行ボブの「移動中」判定に使う(停止中は鳴らさない / ボブしない)。
    const EPS = 1e-5
    this.movedThisFrame = Math.abs(next.x - prevX) > EPS || Math.abs(next.z - prevZ) > EPS
  }

  // --- 近接判定 ---

  /**
   * 全屋台 placement に対しプレイヤーの近接エッジを判定する(StallFramework §4.2)。
   * 各屋台で enter で stall:approach{stallId}、leave で stall:leave{stallId} を各1回発火する
   * (ProximityTracker が単発を保証)。同時に複数圏内になった場合は最近傍1軒を採用してプロンプト/
   * 遷移対象を一意化する(§4.2 タイブレーク)。プロンプトは近接中の屋台位置へ張り替える(§4.2 案a)。
   */
  private updateProximity(): void {
    // 全屋台のエッジを評価し、enter/leave を発火する(評価漏れによる単発ずれを避けるため無条件に回す)。
    let nearestId: string | null = null
    let nearestDistSq = Infinity
    for (const s of this.stallTrackers) {
      const p = s.placement.position
      const edge = s.tracker.update(this.playerPos, { x: p.x, z: p.z })
      if (edge === 'enter') {
        this.events?.emit('stall:approach', { stallId: s.stallId })
        // INTERACTION_SPEC §3.1: 近接圏に入った瞬間に prompt 音を1回(stall:approach と同時)。
        this.events?.emit('sfx:play', { name: 'prompt' })
      } else if (edge === 'leave') {
        this.events?.emit('stall:leave', { stallId: s.stallId })
      }
      // いま圏内なら最近傍候補に入れる(プロンプト/遷移対象の一意化)。
      if (s.tracker.isInside) {
        const dx = this.playerPos.x - p.x
        const dz = this.playerPos.z - p.z
        const d2 = dx * dx + dz * dz
        if (d2 < nearestDistSq) {
          nearestDistSq = d2
          nearestId = s.stallId
        }
      }
    }

    // 近接中の屋台が変わったら、プロンプトを当該屋台位置へ張り替える(同時1軒前提 = 案a)。
    if (nearestId !== this.nearStallId) {
      this.nearStallId = nearestId
      if (nearestId !== null) {
        const placement = this.stallTrackers.find((s) => s.stallId === nearestId)!.placement
        this.prompt.setPosition(placement.position.x - 1.2, placement.promptY, placement.position.z)
        this.prompt.setVisible(true)
      } else {
        this.prompt.setVisible(false)
      }
    }

    // 近接圏内で E または左クリックの立ち上がりエッジ → 会話(dialogue)へ遷移する(stallId を運ぶ / §4.4)。
    this.updateInteract()
  }

  /**
   * 近接圏内での E / 左クリック(立ち上がりエッジ)で会話へ遷移する(T-004 / 多屋台 §4.4)。
   * 近接中の stallId を payload で運ぶ。'interact' 音を発火する(AUDIO_SPEC §4)。
   */
  private updateInteract(): void {
    const input = this.input
    if (!input) return

    const interactDown = input.isDown('KeyE')
    const interactEdge = interactDown && !this.prevInteractDown
    this.prevInteractDown = interactDown

    const mousePressed = input.mouse.pressed
    const clickEdge = mousePressed && !this.prevMousePressed
    this.prevMousePressed = mousePressed

    if (this.nearStallId !== null && (interactEdge || clickEdge)) {
      this.events?.emit('sfx:play', { name: 'interact' })
      this.transitionHandler?.('dialogue', { stallId: this.nearStallId })
    }
  }

  // --- 追従カメラ(ART §5) ---

  /**
   * プレイヤー後方5m・高さ3.2m・俯角15° の追従カメラを lag0.15s で滑らかに追従させる。
   * マウス移動で視線をわずかに(±5°)ヨー追従させる。
   * 指数補間: alpha = 1 - exp(-dt / lag)(フレームレート非依存・lag が時定数)。
   */
  private updateCamera(dt: number): void {
    this.applyMouseLook()

    // 望ましいカメラ位置(プレイヤー後方 = +Z、視線ヨーで左右へ回り込む)。
    const sinYaw = Math.sin(this.lookYaw)
    const cosYaw = Math.cos(this.lookYaw)
    const offsetX = CAMERA_BACK_DISTANCE * sinYaw
    const offsetZ = CAMERA_BACK_DISTANCE * cosYaw
    // 歩行ボブ(INTERACTION_SPEC §3.1: カメラ上下 ±0.03m)。移動中のみ、停止で減衰。
    const bob = walkBobOffset(this.bobPhase, this.bobIntensity)
    this.desiredCamPos.set(
      this.playerPos.x + offsetX,
      CAMERA_HEIGHT + bob,
      this.playerPos.z + offsetZ,
    )

    const alpha = 1 - Math.exp(-dt / CAMERA_LAG)
    this.camera.position.lerp(this.desiredCamPos, alpha)

    // 俯角15°になるよう、プレイヤー足元より少し上を注視点にする。
    // 高さ差 CAMERA_HEIGHT に対し水平距離 = height / tan(15°) を取れば俯角15°。
    this.aimCamera()
  }

  /** マウスX移動量を視線ヨー(±5°)へマップする(過剰回転しない)。 */
  private applyMouseLook(): void {
    const input = this.input
    if (!input) return
    // 画面中央からの左右オフセットを -1..1 に正規化し、最大ヨー角へ写像する。
    const half = window.innerWidth / 2
    const norm = half > 0 ? (input.mouse.x - half) / half : 0
    const clamped = norm < -1 ? -1 : norm > 1 ? 1 : norm
    this.lookYaw = clamped * ((LOOK_YAW_MAX_DEG * Math.PI) / 180)
  }

  /** カメラがプレイヤー方向(俯角15°)を向くよう注視点を設定する。 */
  private aimCamera(): void {
    // 注視点 = プレイヤー位置(やや上)。カメラ高さと水平距離から俯角は自然に15°近傍になる。
    // 注視点の高さを上げて俯角を厳密化する。
    const lookHeight = CAMERA_HEIGHT - CAMERA_BACK_DISTANCE * Math.tan((-CAMERA_PITCH_DEG * Math.PI) / 180)
    this.lookTarget.set(this.playerPos.x, lookHeight, this.playerPos.z)
    this.camera.lookAt(this.lookTarget)
  }

  /** カメラを現在のプレイヤー位置の正しい後方へ即座に移動する(初期化・スナップ用)。 */
  private snapCameraToPlayer(): void {
    this.camera.position.set(
      this.playerPos.x,
      CAMERA_HEIGHT,
      this.playerPos.z + CAMERA_BACK_DISTANCE,
    )
    this.aimCamera()
  }

  /**
   * 接地円(影の代用)の配置。屋台・鳥居の柱元・群衆の足元に暗色円を敷く。
   * 提灯は宙吊りのため接地円は持たない。
   */
  private buildContactCircles(): ContactCircle[] {
    const circles: ContactCircle[] = []

    // 屋台(間口3m×奥行2m を覆う大きめの円)。
    circles.push({ x: STALL_POSITION.x, z: STALL_POSITION.z, radius: 2.4 })

    // 縁日屋台 約19軒(T-012)の足元(影代用の接地円。配置と同一の決定論的座標)。
    for (const p of computeFestivalStallPlacements()) {
      circles.push({ x: p.x, z: p.z, radius: 1.6 })
    }

    // 鳥居の二本柱の足元。
    const toriiPillarHalfSpan = 3
    circles.push({ x: -toriiPillarHalfSpan, z: APPROACH.toriiZ, radius: 0.9 })
    circles.push({ x: toriiPillarHalfSpan, z: APPROACH.toriiZ, radius: 0.9 })

    // 群衆の足元(配置と同一の決定論的座標)。
    for (const p of computeCrowdPlacements()) {
      circles.push({ x: p.x, z: p.z, radius: 0.45 })
    }

    return circles
  }
}
