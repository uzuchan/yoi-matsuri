import {
  CircleGeometry,
  Color,
  ConeGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene as ThreeScene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three'
import type { Scene, SceneContext } from '../../core/SceneManager'
import type { EventBus } from '../../core/EventBus'
import type { InputManager } from '../../core/InputManager'
import {
  DEFAULT_TANK_BOUNDS,
  GoldfishSession,
  type FishState,
  type GoldfishInput,
  type SessionState,
  type TankBounds,
  type Vec2,
} from '../../game/goldfish'
import { clampToPlayArea, isOverBowl, keyboardTarget, type PlayArea } from './projection'
import {
  mapGoldfishEvents,
  mapSubmergeEdge,
  type EmitInstruction,
} from './eventMap'

// --- ART §2 パレット(金魚すくいで使う色のみ。値は ART_DIRECTION.md §2 の正) ---
const COLOR_WATER = '#1e4d6b' // 水面(opacity 0.85)
const COLOR_FISH = '#e84a30' // 金魚(赤)
const COLOR_FISH_EMISSIVE = '#3a0f08' // 金魚 emissive(弱)
const COLOR_WHITE = '#f5f0e8' // 金魚 白模様 / ポイ紙 / お椀の水
const COLOR_POI_FRAME = '#e8c87a' // ポイの枠
const COLOR_FOG = 0x141a38 // フォグ(背景)
const COLOR_TANK_RIM = '#3a3148' // 水槽の縁(参道の土と同系・夜に沈んだ器)
const COLOR_BULB = '#ffd166' // 屋台電球(光源)

// --- ART §5 カメラ: 俯角70°固定・水槽が画面の約70% ---
const CAMERA_PITCH_DEG = 70
const CAMERA_FOV = 42
// 水槽中心からカメラまでの距離 [m]。水槽(幅約1.2m)が画面の約70%を占める値(近いほど大きく映る)。
const CAMERA_DISTANCE = 1.5
const CAMERA_TARGET_Y = 0

// --- 配置 ---
// お椀は水槽の外(画面端=+x側)に置く(GDD §4.1: 画面端にお椀)。水槽縁のすぐ外で画面内に収める。
const BOWL_OFFSET_X = DEFAULT_TANK_BOUNDS.radiusX + 0.24
const BOWL_RADIUS = 0.16 // お椀の見た目半径(確保ヒット判定にも使う)

// 描画高さ(水面 y=0 を基準)。
const FISH_Y = 0.012 // 金魚は水面直下〜直上のごく浅い位置で泳ぐ
const POI_LIFT_Y = 0.05 // 持ち上げ時(水面上)のポイ高さ
const TANK_DEPTH = 0.16 // 水槽鉢の見た目の深さ

// キーボードでポイを動かす速度 [m/s](INTERACTION_SPEC §3.3 矢印キー。水面平面上の一定速度)。
const KEYBOARD_POI_SPEED = 0.5

// 紙の不透明度(ART §2: 耐久で op 0.95→0.4)。
const PAPER_OPACITY_FULL = 0.95
const PAPER_OPACITY_MIN = 0.4
// 残30以下(durabilityRatio<=0.3)で見た目劣化(透け/ヨレ)を段階的に強める(GDD §4.6)。
const PAPER_WARNING_RATIO = 0.3

const FISH_LENGTH = 0.085 // 金魚ボディ長(描画。poiRadius 0.09 と同程度の見た目)

/**
 * 金魚すくい HUD の表示状態(React へ橋渡しする純データ)。
 *
 * HUD は EventBus を経由しない: GameEvents 型(core/EventBus.ts)は本タスクで変更禁止のため、
 * 新しいイベント型を足さず、合成点(App.tsx)が setHudListener で直接 React state へ橋渡しする。
 * (会話 HUD は EventBus 経由だが、それは T-004 で型が確定済み。金魚 HUD は scene 内製の購読で完結させる。)
 */
export interface GoldfishHudState {
  /** HUD を表示するか(セッション中=true、退出/終了後=false で会話と排他)。 */
  readonly active: boolean
  /** 残り時間 [s]。 */
  readonly timeRemaining: number
  /** ポイ耐久比 [0..1](ゲージ・紙の劣化見た目と連動)。 */
  readonly durabilityRatio: number
  /** お椀へ確保した数。 */
  readonly secured: number
}

/** HUD 状態の購読者(合成点が React state へ橋渡し)。 */
export type GoldfishHudListener = (state: GoldfishHudState) => void

/**
 * 金魚すくいシーン(T-006)。T-005 の純TSロジック GoldfishSession を唯一の真実として駆動し、
 * 俯瞰水槽・ポイ・金魚・お椀を ART 準拠で描画する。物理は再実装しない(snapshot を読むだけ)。
 *
 * - カメラ: 俯角70°固定、水槽が画面の約70%(ART §5)。
 * - 入力(INTERACTION_SPEC §3.3): マウス→水面投影で target / 左押下→submerge / 左解放→lift /
 *   お椀上クリック→secure。矢印キーでポイ移動 / Space で沈める・持ち上げトグル / Esc で退出(quit)。
 * - 毎フレーム GoldfishSession.update(dt, input) を呼び、戻り値の GoldfishEvent[] と submerge エッジを
 *   eventMap で EventBus/sfx:play へ写像(発火は単一経路・二重発火なし)。
 * - HUD は React(ui/GoldfishHud)。本シーンは 'goldfish:hud' で表示状態を橋渡しする。
 *
 * GPU リソースは dispose() で全解放(idempotent)。update 内でフレーム毎の new を行わない
 * (ワーク変数を再利用)。
 */
export class GoldfishScene implements Scene {
  readonly id = 'goldfish' as const

  private readonly renderer: WebGLRenderer
  private readonly scene: ThreeScene
  private readonly camera: PerspectiveCamera
  private readonly bounds: TankBounds = DEFAULT_TANK_BOUNDS

  // --- セッション(T-005 ロジック) ---
  private session: GoldfishSession | null = null
  private finishedEmitted = false

  // --- core ハンドル ---
  private events: EventBus | null = null
  private input: InputManager | null = null
  /** HUD 状態の購読者(合成点が注入。EventBus を経由しない React 橋渡し)。 */
  private hudListener: GoldfishHudListener | null = null

  /** 合成点(App.tsx)から HUD 購読者を注入する。 */
  setHudListener(listener: GoldfishHudListener): void {
    this.hudListener = listener
  }

  // --- 描画オブジェクト(構築時に生成・再利用) ---
  private readonly water: Mesh
  private readonly waterMaterial: MeshStandardMaterial
  private readonly tankRim: Mesh
  private readonly bowl: Group
  private readonly bowlFishGroup: Group
  private readonly poiGroup: Group
  private readonly poiPaper: Mesh
  private readonly poiPaperMaterial: MeshBasicMaterial
  private readonly poiFrame: Mesh
  private readonly lighting: Group

  // 金魚プール(fishCount 分を構築時に生成し、snapshot で位置/向きだけ更新)。
  private readonly fishMeshes: FishMesh[] = []
  private readonly fishBodyMaterial: MeshStandardMaterial
  private readonly fishPatternMaterial: MeshBasicMaterial

  // dispose 用 geometry 集約。
  private readonly geometries: { dispose(): void }[] = []
  private disposed = false

  // --- 入力エッジ状態 ---
  private prevSubmerged = false
  private prevSpaceDown = false
  private prevMousePressed = false
  /** Space トグルによる沈め状態(キーボード経路)。マウス押下とは OR で合成する。 */
  private spaceToggleSubmerged = 0 // 0=持ち上げ / 1=沈め(トグル状態)
  private prevEscDown = false

  // --- 入力組み立てのワーク変数(フレーム毎アロケーション回避) ---
  private readonly poiTarget: Vec2 = { x: 0, z: 0 }
  private readonly raycaster = new Raycaster()
  private readonly waterPlane = new Plane(new Vector3(0, 1, 0), 0)
  private readonly ndc = new Vector2()
  private readonly hitPoint = new Vector3()
  private readonly inputBuf: { target: Vec2; submerge: boolean; secure: boolean; quit: boolean } = {
    target: { x: 0, z: 0 },
    submerge: false,
    secure: false,
    quit: false,
  }
  /** お椀の中心(水面 2D 座標)。 */
  private readonly bowlCenter: Vec2 = { x: BOWL_OFFSET_X, z: 0 }
  /** ポイの可動範囲(水槽 + お椀を含む矩形)。お椀まで運べるよう楕円ではなく矩形でクランプする。 */
  private readonly playArea: PlayArea = {
    minX: -DEFAULT_TANK_BOUNDS.radiusX,
    maxX: BOWL_OFFSET_X + BOWL_RADIUS,
    minZ: -DEFAULT_TANK_BOUNDS.radiusZ,
    maxZ: DEFAULT_TANK_BOUNDS.radiusZ,
  }

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.scene = new ThreeScene()
    this.scene.fog = new FogExp2(COLOR_FOG, 0.12)
    this.scene.background = new Color(COLOR_FOG)

    const size = renderer.getSize(new Vector2())
    const aspect = size.y > 0 ? size.x / size.y : 16 / 9
    this.camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.05, 50)
    this.placeCamera()

    const track = <T extends { dispose(): void }>(g: T): T => {
      this.geometries.push(g)
      return g
    }

    // --- 水槽の縁(楕円の器。水面より一段下げて深さを見せる) ---
    const rimGeo = track(new RingGeometry(0.96, 1.12, 48))
    this.tankRim = new Mesh(
      rimGeo,
      new MeshStandardMaterial({ color: COLOR_TANK_RIM, roughness: 0.9, metalness: 0 }),
    )
    this.tankRim.rotation.x = -Math.PI / 2
    this.tankRim.position.y = 0.002
    this.tankRim.scale.set(this.bounds.radiusX, this.bounds.radiusZ, 1)
    this.scene.add(this.tankRim)

    // 鉢の側面(楕円柱の暗い壁。深さ感)。水面の少し下に沈める。
    const wallGeo = track(new RingGeometry(0.999, 1.0, 48))
    const wallMat = new MeshStandardMaterial({
      color: new Color(COLOR_TANK_RIM).multiplyScalar(0.6),
      roughness: 1,
      metalness: 0,
    })
    const wall = new Mesh(wallGeo, wallMat)
    wall.rotation.x = -Math.PI / 2
    wall.position.y = -TANK_DEPTH
    wall.scale.set(this.bounds.radiusX, this.bounds.radiusZ, 1)
    this.scene.add(wall)

    // --- 水面(楕円・#1e4d6b op0.85)。半透明、わずかに発光させて夜でも沈まないように ---
    const waterGeo = track(new CircleGeometry(1, 64))
    this.waterMaterial = new MeshStandardMaterial({
      color: COLOR_WATER,
      emissive: new Color(COLOR_WATER),
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0,
    })
    this.water = new Mesh(waterGeo, this.waterMaterial)
    this.water.rotation.x = -Math.PI / 2
    this.water.position.y = 0
    this.water.scale.set(this.bounds.radiusX, this.bounds.radiusZ, 1)
    this.scene.add(this.water)

    // 水槽の底(沈んだ暗色の水。深さの底面)。
    const floorGeo = track(new CircleGeometry(1, 48))
    const floorMat = new MeshStandardMaterial({
      color: new Color(COLOR_WATER).multiplyScalar(0.4),
      roughness: 1,
      metalness: 0,
    })
    const floor = new Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -TANK_DEPTH + 0.001
    floor.scale.set(this.bounds.radiusX, this.bounds.radiusZ, 1)
    this.scene.add(floor)

    // --- 金魚プール(共有マテリアル + 個別メッシュ) ---
    this.fishBodyMaterial = new MeshStandardMaterial({
      color: COLOR_FISH,
      emissive: new Color(COLOR_FISH_EMISSIVE),
      emissiveIntensity: 0.6,
      roughness: 0.5,
      metalness: 0,
    })
    this.fishPatternMaterial = new MeshBasicMaterial({ color: COLOR_WHITE })
    const fishBodyGeo = track(new SphereGeometry(1, 10, 8))
    const fishTailGeo = track(new ConeGeometry(0.5, 1, 8))
    const fishPatternGeo = track(new SphereGeometry(1, 8, 6))
    // 金魚は最大 fishCount 匹。snapshot のサイズに合わせて必要数だけ可視化する。
    for (let i = 0; i < MAX_FISH; i++) {
      const fm = createFishMesh(
        this.fishBodyMaterial,
        this.fishPatternMaterial,
        fishBodyGeo,
        fishTailGeo,
        fishPatternGeo,
      )
      fm.group.visible = false
      this.fishMeshes.push(fm)
      this.scene.add(fm.group)
    }

    // --- ポイ(枠 #e8c87a + 紙 #f5f0e8) ---
    this.poiGroup = new Group()
    this.poiGroup.name = 'poi'
    const poiR = 0.09 // poiRadius と一致(GDD §4.3)
    const frameGeo = track(new TorusGeometry(poiR, 0.012, 8, 28))
    this.poiFrame = new Mesh(
      frameGeo,
      new MeshStandardMaterial({ color: COLOR_POI_FRAME, roughness: 0.5, metalness: 0.1 }),
    )
    this.poiFrame.rotation.x = -Math.PI / 2
    this.poiGroup.add(this.poiFrame)
    const paperGeo = track(new CircleGeometry(poiR, 28))
    this.poiPaperMaterial = new MeshBasicMaterial({
      color: COLOR_WHITE,
      transparent: true,
      opacity: PAPER_OPACITY_FULL,
      depthWrite: false,
    })
    this.poiPaper = new Mesh(paperGeo, this.poiPaperMaterial)
    this.poiPaper.rotation.x = -Math.PI / 2
    this.poiPaper.position.y = -0.001
    this.poiGroup.add(this.poiPaper)
    // 持ち手(短い棒)。
    const handleGeo = track(new TorusGeometry(poiR, 0.008, 6, 4, Math.PI * 0.5))
    const handle = new Mesh(handleGeo, this.poiFrame.material)
    handle.rotation.x = -Math.PI / 2
    handle.position.set(poiR, 0, poiR)
    this.poiGroup.add(handle)
    this.poiGroup.position.set(0, POI_LIFT_Y, 0)
    this.scene.add(this.poiGroup)

    // --- お椀(画面端。確保した金魚を入れる) ---
    this.bowl = new Group()
    this.bowl.name = 'bowl'
    const bowlOuterGeo = track(new RingGeometry(BOWL_RADIUS * 0.78, BOWL_RADIUS, 32))
    const bowlMat = new MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.7, metalness: 0 })
    const bowlRim = new Mesh(bowlOuterGeo, bowlMat)
    bowlRim.rotation.x = -Math.PI / 2
    bowlRim.position.y = 0.004
    this.bowl.add(bowlRim)
    const bowlWaterGeo = track(new CircleGeometry(BOWL_RADIUS * 0.82, 32))
    const bowlWaterMat = new MeshStandardMaterial({
      color: COLOR_WATER,
      emissive: new Color(COLOR_WATER),
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0,
    })
    const bowlWater = new Mesh(bowlWaterGeo, bowlWaterMat)
    bowlWater.rotation.x = -Math.PI / 2
    bowlWater.position.y = 0.002
    this.bowl.add(bowlWater)
    this.bowl.position.set(this.bowlCenter.x, 0, this.bowlCenter.z)
    this.scene.add(this.bowl)

    // お椀に並べる確保金魚(最初は非表示。確保ごとに 1 匹ずつ出す)。
    this.bowlFishGroup = new Group()
    for (let i = 0; i < MAX_FISH; i++) {
      const fm = createFishMesh(
        this.fishBodyMaterial,
        this.fishPatternMaterial,
        fishBodyGeo,
        fishTailGeo,
        fishPatternGeo,
      )
      fm.group.visible = false
      this.bowlFishGroup.add(fm.group)
    }
    this.bowl.add(this.bowlFishGroup)

    // dispose 集約用に bowl のマテリアルも保持。
    this.disposableMaterials.push(
      this.waterMaterial,
      wallMat,
      floorMat,
      this.fishBodyMaterial,
      this.fishPatternMaterial,
      this.poiPaperMaterial,
      this.tankRim.material as MeshStandardMaterial,
      this.poiFrame.material as MeshStandardMaterial,
      bowlMat,
      bowlWaterMat,
    )

    // --- ライティング(寒色の環境光 + 屋台の暖色 1 灯。動的ライト 2 灯のみ) ---
    this.lighting = new Group()
    const hemi = new HemisphereLight('#2a3360', '#1a1430', 0.85)
    this.lighting.add(hemi)
    const warm = new PointLight(COLOR_BULB, 1.4, 8, 2)
    warm.position.set(0.3, 1.6, 0.6)
    this.lighting.add(warm)
    this.lightingLights.push(hemi, warm)
    this.scene.add(this.lighting)
  }

  private readonly disposableMaterials: { dispose(): void }[] = []
  private readonly lightingLights: { dispose(): void }[] = []

  enter(ctx: SceneContext): void {
    this.events = ctx.events
    this.input = ctx.input

    // 新しいセッションを開始(毎回まっさらな状態で遊べる)。
    this.session = new GoldfishSession()
    this.finishedEmitted = false

    // 入力エッジ基準を現在状態へ揃える(会話から入った直後の押下を誤検出しない)。
    this.prevSubmerged = false
    this.prevSpaceDown = ctx.input.isDown('Space')
    this.prevMousePressed = ctx.input.mouse.pressed
    this.prevEscDown = ctx.input.isDown('Escape')
    this.spaceToggleSubmerged = 0

    // ポイ目標を初期化(水槽中心)。
    this.poiTarget.x = 0
    this.poiTarget.z = 0

    // お椀の確保金魚を全て隠す。
    for (const child of this.bowlFishGroup.children) child.visible = false

    // 開始時 HUD を出す(GoldfishHud 側が active 化を検知して開始2秒ヒントを表示する)。
    this.emitHud()
  }

  exit(): void {
    // HUD を閉じる(会話と排他のため、抜けたら非表示)。
    this.hudListener?.({ active: false, timeRemaining: 0, durabilityRatio: 0, secured: 0 })
    this.events = null
    this.input = null
    this.session = null
  }

  update(dt: number): void {
    const session = this.session
    const input = this.input
    if (!session || !input) return
    if (session.currentStatus !== 'playing') return

    // 1) 入力を組み立てる(マウス投影 or 矢印キー、submerge、secure、quit)。
    const gfInput = this.buildInput(dt)

    // 2) セッションを 1 ステップ(物理の唯一の真実)。
    const gfEvents = session.update(dt, gfInput)

    // 3) submerge エッジ → poi-dip / poi-lift、GoldfishEvent → sfx/GameEvents を発火(単一経路)。
    const instructions: EmitInstruction[] = []
    for (const ins of mapSubmergeEdge(this.prevSubmerged, gfInput.submerge)) instructions.push(ins)
    for (const ins of mapGoldfishEvents(gfEvents)) instructions.push(ins)
    this.flush(instructions)
    this.prevSubmerged = gfInput.submerge

    // 4) HUD 更新(確保数・残時間・耐久)。
    this.emitHud()
  }

  render(_alpha: number): void {
    // セッション状態を読んで描画を更新(物理は再計算しない)。
    const snap = this.session?.snapshot()
    if (snap) this.syncVisuals(snap)
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = height > 0 ? width / height : 16 / 9
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const g of this.geometries) g.dispose()
    for (const m of this.disposableMaterials) m.dispose()
    for (const l of this.lightingLights) l.dispose()
    this.scene.background = null
    this.scene.fog = null
    this.events = null
    this.input = null
    this.session = null
  }

  // --- 入力組み立て ---

  /**
   * 1 フレームの GoldfishInput を組み立てる(マウス投影 or 矢印キー / submerge / secure / quit)。
   * マウス・キーボードどちらでも完結する(INTERACTION_SPEC §3.3)。
   */
  private buildInput(dt: number): GoldfishInput {
    const input = this.input!

    // --- 目標位置(target) ---
    // 矢印キーが押されていればキーボード移動。なければマウス投影を使う。
    const up = input.isDown('ArrowUp')
    const down = input.isDown('ArrowDown')
    const left = input.isDown('ArrowLeft')
    const right = input.isDown('ArrowRight')
    if (up || down || left || right) {
      const next = keyboardTarget(this.poiTarget, { up, down, left, right }, dt, KEYBOARD_POI_SPEED, this.playArea)
      this.poiTarget.x = next.x
      this.poiTarget.z = next.z
    } else {
      const projected = this.projectCursorToWater(input.mouse.x, input.mouse.y)
      if (projected) {
        const clamped = clampToPlayArea(projected, this.playArea)
        this.poiTarget.x = clamped.x
        this.poiTarget.z = clamped.z
      }
    }

    // お椀の上か(確保位置)。お椀の上ではポイは沈めず「確保(secure)」操作に充てる(GDD §4.2 手順4)。
    const overBowl = isOverBowl(this.poiTarget, this.bowlCenter, BOWL_RADIUS)

    // --- submerge(沈める) ---
    // Space はトグル(立ち上がりで反転)。マウスは押下中=沈め。
    const spaceDown = input.isDown('Space')
    const spaceToggledOn = spaceDown && !this.prevSpaceDown // トグルが ON 方向へ立ち上がった瞬間
    if (spaceDown && !this.prevSpaceDown) {
      this.spaceToggleSubmerged = this.spaceToggleSubmerged === 1 ? 0 : 1
    }
    this.prevSpaceDown = spaceDown

    const mousePressed = input.mouse.pressed
    const mouseEdgeDown = mousePressed && !this.prevMousePressed
    this.prevMousePressed = mousePressed

    // --- secure(お椀上でクリック確保) ---
    // マウス: お椀の上で左クリックの立ち上がり。
    // キーボード: お椀の上で Space トグルが ON へ立ち上がった瞬間(「お椀上で再度沈める」の代替)。
    let secure = false
    if (overBowl && (mouseEdgeDown || spaceToggledOn)) secure = true

    // submerge は「マウス押下」または「Space トグル沈め」。
    // お椀の上では沈めない(クリック/トグルは確保意図に充てる。誤って紙ダメージを受けないため)。
    const submerge = !overBowl && (mousePressed || this.spaceToggleSubmerged === 1)

    // --- quit(Esc 退出) ---
    const escDown = input.isDown('Escape')
    const quit = escDown && !this.prevEscDown
    this.prevEscDown = escDown

    this.inputBuf.target = this.poiTarget
    this.inputBuf.submerge = submerge
    this.inputBuf.secure = secure
    this.inputBuf.quit = quit
    return this.inputBuf
  }

  /**
   * スクリーン座標(clientX/Y)を水面平面(y=0)へレイキャストして水槽 2D 座標を得る。
   * 俯角70°カメラでもレイ交差で正確に水面へ当てる(Risk(1))。失敗時は null。
   */
  private projectCursorToWater(clientX: number, clientY: number): Vec2 | null {
    const w = window.innerWidth
    const h = window.innerHeight
    if (w <= 0 || h <= 0) return null
    this.ndc.set((clientX / w) * 2 - 1, -((clientY / h) * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hit = this.raycaster.ray.intersectPlane(this.waterPlane, this.hitPoint)
    if (!hit) return null
    return { x: hit.x, z: hit.z }
  }

  /** 発火指示列を EventBus へ流す(単一経路)。 */
  private flush(instructions: readonly EmitInstruction[]): void {
    const events = this.events
    if (!events) return
    for (const ins of instructions) {
      if (ins.event === 'goldfish:finished') {
        // finished は 1 回だけ(二重発火しない)。終了後の遷移は App が購読して行う。
        if (this.finishedEmitted) continue
        this.finishedEmitted = true
        events.emit('goldfish:finished', ins.payload)
      } else if (ins.event === 'goldfish:caught') {
        events.emit('goldfish:caught', ins.payload)
      } else if (ins.event === 'goldfish:poi-torn') {
        events.emit('goldfish:poi-torn', ins.payload)
      } else {
        events.emit('sfx:play', ins.payload)
      }
    }
  }

  // --- 描画同期 ---

  /** セッションの公開状態を読んで、ポイ・金魚・お椀・紙の劣化を更新する(物理は再計算しない)。 */
  private syncVisuals(snap: SessionState): void {
    // ポイ(位置・深さ・紙の劣化)。
    const poi = snap.poi
    const poiY = poi.submerged ? POI_LIFT_Y - poi.depth : POI_LIFT_Y
    this.poiGroup.position.set(poi.position.x, poiY, poi.position.z)
    // 紙の不透明度(耐久で 0.95→0.4)。残30以下でさらに透けを強める(段階劣化)。
    let opacity = PAPER_OPACITY_MIN + (PAPER_OPACITY_FULL - PAPER_OPACITY_MIN) * poi.durabilityRatio
    if (poi.durabilityRatio <= PAPER_WARNING_RATIO) {
      // 残30以下: 透けを段階的に強める(警告ゾーンで min をさらに下げる)。
      const t = poi.durabilityRatio / PAPER_WARNING_RATIO // 1→0
      opacity *= 0.55 + 0.45 * t
    }
    this.poiPaperMaterial.opacity = opacity

    // 金魚(swimming/onPoi のみ水槽に描く。secured はお椀へ)。
    const fish = snap.fish
    for (let i = 0; i < this.fishMeshes.length; i++) {
      const fm = this.fishMeshes[i]
      const fs: FishState | undefined = fish[i]
      if (!fs || fs.status === 'secured') {
        fm.group.visible = false
        continue
      }
      fm.group.visible = true
      const y = fs.status === 'onPoi' ? poiY + 0.012 : FISH_Y
      fm.group.position.set(fs.position.x, y, fs.position.z)
      // heading 方向へ向ける(俯瞰なので y 軸回り)。
      const angle = Math.atan2(fs.heading.x, fs.heading.z)
      fm.group.rotation.y = angle
      // 逃避中は少し跳ねる/速く尾を振る演出、onPoi は静かに乗る。
      this.animateFish(fm, fs)
    }

    // お椀の確保金魚を必要数だけ表示(secured カウントに合わせて並べる)。
    this.updateBowlFish(snap.secured)
  }

  /** 金魚の尾の振り・逃避の跳ねを進める(描画演出。物理ではない)。 */
  private animateFish(fm: FishMesh, fs: FishState): void {
    fm.phase += fs.fleeing ? 0.5 : 0.18
    const swing = (fs.fleeing ? 0.5 : 0.32) * Math.sin(fm.phase)
    fm.tail.rotation.y = swing
    if (fs.fleeing) {
      // 逃避中はわずかに身を反らす(慌てている見た目)。
      fm.body.rotation.z = 0.18 * Math.sin(fm.phase * 1.6)
    } else {
      fm.body.rotation.z = 0
    }
  }

  /** お椀の中に確保済みの金魚を並べる(確保数に追従)。 */
  private updateBowlFish(secured: number): void {
    const children = this.bowlFishGroup.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (i < secured) {
        child.visible = true
        // お椀内に小さく円形配置。
        const a = (i / Math.max(1, secured)) * Math.PI * 2
        const r = secured > 1 ? BOWL_RADIUS * 0.4 : 0
        child.position.set(Math.cos(a) * r, 0.006, Math.sin(a) * r)
        child.scale.setScalar(0.85)
        child.rotation.y = a + Math.PI / 2
      } else {
        child.visible = false
      }
    }
  }

  // --- HUD ---

  /** HUD 表示状態(残時間・耐久・確保数)を React へ橋渡しする(EventBus 非経由)。 */
  private emitHud(): void {
    const snap = this.session?.snapshot()
    if (!snap) return
    this.hudListener?.({
      active: true,
      timeRemaining: snap.timeRemaining,
      durabilityRatio: snap.poi.durabilityRatio,
      secured: snap.secured,
    })
  }

  // --- カメラ ---

  /** 俯角70°固定で水槽中心を見下ろす位置にカメラを置く(ART §5)。 */
  private placeCamera(): void {
    const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180
    // 俯角70°: 水平からの下向き角。カメラは中心の手前(+z)上空に置く。
    const y = CAMERA_DISTANCE * Math.sin(pitch)
    const z = CAMERA_DISTANCE * Math.cos(pitch)
    this.camera.position.set(0, y, z)
    this.camera.lookAt(0, CAMERA_TARGET_Y, 0)
  }
}

// --- 金魚メッシュ(共有ジオメトリ/マテリアルで個別 Group を作る) ---

interface FishMesh {
  group: Group
  body: Mesh
  tail: Mesh
  phase: number
}

/** 最大金魚数(プール確保用。GDD fishCount=8 だが余裕を持つ)。 */
const MAX_FISH = 8

/**
 * 金魚 1 匹の描画 Group を作る(紡錘ボディ + 三角尾びれ + 白模様)。
 * ジオメトリ/マテリアルは共有(呼び出し側が dispose する)。
 */
function createFishMesh(
  bodyMat: MeshStandardMaterial,
  patternMat: MeshBasicMaterial,
  bodyGeo: SphereGeometry,
  tailGeo: ConeGeometry,
  patternGeo: SphereGeometry,
): FishMesh {
  const group = new Group()
  group.name = 'fish'

  // ボディ(紡錘形: 球を前後に伸ばす)。+z が頭の向き。
  const body = new Mesh(bodyGeo, bodyMat)
  body.scale.set(FISH_LENGTH * 0.42, FISH_LENGTH * 0.34, FISH_LENGTH * 0.62)
  group.add(body)

  // 尾びれ(三角錐を平たく)。尾は -z 側(後ろ)。
  const tail = new Mesh(tailGeo, bodyMat)
  tail.scale.set(FISH_LENGTH * 0.34, FISH_LENGTH * 0.02, FISH_LENGTH * 0.4)
  tail.rotation.x = Math.PI / 2
  tail.position.set(0, 0, -FISH_LENGTH * 0.5)
  group.add(tail)

  // 白模様(背中の小さな点)。
  const pattern = new Mesh(patternGeo, patternMat)
  pattern.scale.set(FISH_LENGTH * 0.16, FISH_LENGTH * 0.08, FISH_LENGTH * 0.22)
  pattern.position.set(0, FISH_LENGTH * 0.18, FISH_LENGTH * 0.05)
  group.add(pattern)

  return { group, body, tail, phase: 0 }
}
