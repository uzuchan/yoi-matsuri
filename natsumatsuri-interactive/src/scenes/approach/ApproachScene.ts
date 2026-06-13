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
import {
  APPROACH,
  PALETTE,
  STALL_ID,
  STALL_POSITION,
  WALK_BOUNDS,
  computeCrowdPlacements,
  computeLanternAnchors,
  createCrowd,
  createGround,
  createLanterns,
  createLighting,
  createPlayer,
  createPromptLabel,
  createSky,
  createStall,
  createTorii,
  integrateMovement,
  keyboardMoveVector,
  mouseForwardVector,
  pickRepresentativeLanterns,
  ProximityTracker,
  type ContactCircle,
  type PromptLabel,
  type Vec2,
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
  private readonly proximity = new ProximityTracker()
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
    const crowd = createCrowd()
    const lighting = createLighting(lanternLightAnchors)
    this.player = createPlayer()

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
      crowd,
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
    this.proximity.reset()
    this.prompt.setVisible(false)
    this.lookYaw = 0
  }

  exit(): void {
    // シーンは常駐し再入場可能。入力ハンドルは enter で取り直す。GPU解放は dispose で行う。
    this.events = null
    this.input = null
  }

  update(dt: number): void {
    this.updatePlayer(dt)
    this.updateProximity()
    this.updateCamera(dt)

    // 提灯の揺れ・プロンプトのフェードなど動的要素を駆動。
    for (const w of this.animated) {
      w.update?.(dt)
    }
  }

  render(_alpha: number): void {
    this.renderer.render(this.scene, this.camera)
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

    const next = integrateMovement(this.playerPos, { x: moveX, z: moveZ }, dt, undefined, WALK_BOUNDS)
    this.playerPos.x = next.x
    this.playerPos.z = next.z
    this.player.object.position.set(next.x, 0, next.z)
  }

  // --- 近接判定 ---

  /**
   * プレイヤーと屋台の近接エッジを判定し、enter で stall:approach、leave で stall:leave を
   * 各1回発火する(ProximityTracker が単発を保証)。プロンプトの表示/非表示も切り替える。
   */
  private updateProximity(): void {
    const edge = this.proximity.update(this.playerPos, STALL_POSITION)
    if (edge === 'enter') {
      this.events?.emit('stall:approach', { stallId: STALL_ID })
      this.prompt.setVisible(true)
    } else if (edge === 'leave') {
      this.events?.emit('stall:leave', { stallId: STALL_ID })
      this.prompt.setVisible(false)
    }
    // 'none' は何もしない(滞在中・圏外滞在中の連続発火を起こさない)。

    // E押下 → 会話(dialogue)への遷移は T-004(gameplay-engineer)の所有のため、
    // ここでは意図的に未実装。AC8: ダミーの会話/未接続画面を作らない。
    // T-004 では stall:approach を購読してプロンプト点灯を扱い、近接中の E/左クリックで
    // SceneManager.transition('dialogue') を行う(引き継ぎは報告参照)。
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
    this.desiredCamPos.set(
      this.playerPos.x + offsetX,
      CAMERA_HEIGHT,
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
