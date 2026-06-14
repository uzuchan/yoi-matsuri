import {
  CircleGeometry,
  Color,
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
import type { SceneContext } from '../../../../core/SceneManager'
import type { EventBus } from '../../../../core/EventBus'
import type { InputManager } from '../../../../core/InputManager'
import type { StallResult } from '../../../../game/stall'
import type { StallScene, StallHudState } from '../../types'
import {
  SuperballSession,
  SUPERBALL_COLORS,
  SUPERBALL_TANK_BOUNDS,
  type BallState,
  type SuperballInput,
  type SuperballState,
} from '../../../../game/superball'
import type { Vec2 } from '../../../../game/goldfish'
import {
  clampToPlayArea,
  isOverBowl,
  keyboardTarget,
  type PlayArea,
} from '../../../goldfish/projection'
import {
  mapSuperballEvents,
  mapSuperballSubmergeEdge,
  type SuperballEmit,
} from './eventMap'

// --- ART §2 パレット(スーパーボールすくいで使う色。すべて §2 + 花火3色の既存パレット内) ---
const COLOR_WATER = '#1e4d6b'
const COLOR_WHITE = '#f5f0e8'
const COLOR_POI_FRAME = '#e8c87a'
const COLOR_FOG = 0x141a38
const COLOR_TANK_RIM = '#3a3148'
const COLOR_BULB = '#ffd166'

// --- ART §5 カメラ: 俯瞰(金魚すくいと同構図) ---
const CAMERA_PITCH_DEG = 70
const CAMERA_FOV = 42
const CAMERA_DISTANCE = 1.5
const CAMERA_TARGET_Y = 0

const BOWL_OFFSET_X = SUPERBALL_TANK_BOUNDS.radiusX + 0.24
const BOWL_RADIUS = 0.16
const BALL_RADIUS = 0.05 // スーパーボールの見た目半径
const BALL_FLOAT_Y = 0.02 // 水面に浮かぶボールの中心高さ
const POI_LIFT_Y = 0.05
const TANK_DEPTH = 0.16
const KEYBOARD_POI_SPEED = 0.5

const PAPER_OPACITY_FULL = 0.95
const PAPER_OPACITY_MIN = 0.4
const PAPER_WARNING_RATIO = 0.3

/** 最大ボール数(描画プール確保用。DEFAULT_SUPERBALL_PARAMS.ballCount=10 + 余裕)。 */
const MAX_BALLS = 12

/** スーパーボールすくいの屋号(汎用 HUD・結果見出しに使う表示名)。 */
export const SUPERBALL_DISPLAY_NAME = 'スーパーボールすくい'

/** スーパーボールすくいの操作ヒント(開始 2 秒だけ表示)。 */
export const SUPERBALL_HINT = 'そっとすくおう。たくさんすくえるよ'

/**
 * スーパーボールすくいシーン(MINIGAME_ARCHETYPES 原型A SCOOP / 屋台#1)。
 *
 * 屋台フレームワークの StallScene(汎用 minigame の中身)として駆動される。SuperballSession を唯一の
 * 真実として、俯瞰水槽・ポイ・浮かぶボール・お椀を ART 準拠で描画する。物理は再実装しない
 * (snapshot を読むだけ)。**ポイ物理は SuperballSession が金魚の Poi を再利用**しているため
 * 手触り("そっとすくう")は金魚すくいと同型。対象は逃げずゆらゆら漂う色とりどりのボール(§2 #1)。
 *
 * - カメラ: 俯角70°固定(金魚と同構図)。
 * - 入力: マウス→水面投影で target / 左押下→submerge / 左解放→lift / お椀上クリック→secure。
 *   矢印キーでポイ移動 / Space で沈める・持ち上げトグル / Esc で退出(quit)。マウス・キーボード両完結。
 * - HUD は汎用 StallHud(gauge=ポイ耐久・score=確保数)。
 *
 * GPU リソースは dispose() で全解放(idempotent)。update 内でフレーム毎の new を行わない。
 */
export class SuperballScene implements StallScene {
  readonly id = 'minigame' as const

  private readonly renderer: WebGLRenderer
  private readonly scene: ThreeScene
  private readonly camera: PerspectiveCamera
  private readonly bounds = SUPERBALL_TANK_BOUNDS

  private session: SuperballSession | null = null
  private finishedEmitted = false

  private events: EventBus | null = null
  private input: InputManager | null = null
  private hudListener: ((state: StallHudState | null) => void) | null = null

  setHudListener(listener: (state: StallHudState | null) => void): void {
    this.hudListener = listener
  }

  // --- 描画オブジェクト ---
  private readonly poiGroup: Group
  private readonly poiPaper: Mesh
  private readonly poiPaperMaterial: MeshBasicMaterial
  private readonly bowl: Group
  private readonly bowlBallGroup: Group

  // ボールプール(色ごとに共有マテリアル。位置/可視を snapshot から更新)。
  private readonly ballMeshes: Mesh[] = []
  private readonly bowlBallMeshes: Mesh[] = []
  private readonly ballMaterials: MeshStandardMaterial[] = []

  private readonly geometries: { dispose(): void }[] = []
  private readonly disposableMaterials: { dispose(): void }[] = []
  private readonly lightingLights: { dispose(): void }[] = []
  private disposed = false

  // --- 入力エッジ状態 ---
  private prevSubmerged = false
  private prevSpaceDown = false
  private prevMousePressed = false
  private spaceToggleSubmerged = 0
  private prevEscDown = false

  // --- 入力組み立てワーク(フレーム毎アロケーション回避) ---
  private readonly poiTarget: Vec2 = { x: 0, z: 0 }
  private readonly raycaster = new Raycaster()
  private readonly waterPlane = new Plane(new Vector3(0, 1, 0), 0)
  private readonly ndc = new Vector2()
  private readonly hitPoint = new Vector3()
  private readonly inputBuf: SuperballInput & {
    target: Vec2
    submerge: boolean
    secure: boolean
    quit: boolean
  } = { target: { x: 0, z: 0 }, submerge: false, secure: false, quit: false }
  private readonly bowlCenter: Vec2 = { x: BOWL_OFFSET_X, z: 0 }
  private readonly playArea: PlayArea = {
    minX: -SUPERBALL_TANK_BOUNDS.radiusX,
    maxX: BOWL_OFFSET_X + BOWL_RADIUS,
    minZ: -SUPERBALL_TANK_BOUNDS.radiusZ,
    maxZ: SUPERBALL_TANK_BOUNDS.radiusZ,
  }

  private readonly stallId: string
  private readonly displayName: string

  constructor(renderer: WebGLRenderer, stallId: string, displayName: string = SUPERBALL_DISPLAY_NAME) {
    this.renderer = renderer
    this.stallId = stallId
    this.displayName = displayName
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

    // --- 水槽の縁・側壁・水面・底(金魚すくいと同じ器) ---
    const rimGeo = track(new RingGeometry(0.96, 1.12, 48))
    const rimMat = new MeshStandardMaterial({ color: COLOR_TANK_RIM, roughness: 0.9, metalness: 0 })
    const rim = new Mesh(rimGeo, rimMat)
    rim.rotation.x = -Math.PI / 2
    rim.position.y = 0.002
    rim.scale.set(this.bounds.radiusX, this.bounds.radiusZ, 1)
    this.scene.add(rim)

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

    const waterGeo = track(new CircleGeometry(1, 64))
    const waterMat = new MeshStandardMaterial({
      color: COLOR_WATER,
      emissive: new Color(COLOR_WATER),
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0,
    })
    const water = new Mesh(waterGeo, waterMat)
    water.rotation.x = -Math.PI / 2
    water.position.y = 0
    water.scale.set(this.bounds.radiusX, this.bounds.radiusZ, 1)
    this.scene.add(water)

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

    // --- ボールプール(色ごとに共有マテリアル) ---
    const ballGeo = track(new SphereGeometry(BALL_RADIUS, 12, 10))
    for (const hex of SUPERBALL_COLORS) {
      const mat = new MeshStandardMaterial({
        color: hex,
        emissive: new Color(hex),
        emissiveIntensity: 0.35, // つやのある弾むボール(夜でも色が読める)
        roughness: 0.25,
        metalness: 0.05,
      })
      this.ballMaterials.push(mat)
      this.disposableMaterials.push(mat)
    }
    // 水面のボール(漂う対象)。
    for (let i = 0; i < MAX_BALLS; i++) {
      const m = new Mesh(ballGeo, this.ballMaterials[0])
      m.visible = false
      this.ballMeshes.push(m)
      this.scene.add(m)
    }

    // --- ポイ(枠 + 紙) ---
    this.poiGroup = new Group()
    this.poiGroup.name = 'poi'
    const poiR = 0.1 // SUPERBALL_POI_PARAMS.poiRadius と一致
    const frameGeo = track(new TorusGeometry(poiR, 0.012, 8, 28))
    const frameMat = new MeshStandardMaterial({ color: COLOR_POI_FRAME, roughness: 0.5, metalness: 0.1 })
    const poiFrame = new Mesh(frameGeo, frameMat)
    poiFrame.rotation.x = -Math.PI / 2
    this.poiGroup.add(poiFrame)
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
    const handleGeo = track(new TorusGeometry(poiR, 0.008, 6, 4, Math.PI * 0.5))
    const handle = new Mesh(handleGeo, frameMat)
    handle.rotation.x = -Math.PI / 2
    handle.position.set(poiR, 0, poiR)
    this.poiGroup.add(handle)
    this.poiGroup.position.set(0, POI_LIFT_Y, 0)
    this.scene.add(this.poiGroup)
    this.disposableMaterials.push(this.poiPaperMaterial, frameMat, rimMat, wallMat, waterMat, floorMat)

    // --- お椀(画面端。確保したボールを入れる) ---
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
    this.disposableMaterials.push(bowlMat, bowlWaterMat)

    // お椀に並べる確保ボール(色は確保ごとに割り当てる。初期は非表示)。
    this.bowlBallGroup = new Group()
    for (let i = 0; i < MAX_BALLS; i++) {
      const m = new Mesh(ballGeo, this.ballMaterials[0])
      m.visible = false
      this.bowlBallMeshes.push(m)
      this.bowlBallGroup.add(m)
    }
    this.bowl.add(this.bowlBallGroup)

    // --- ライティング(寒色環境光 + 屋台の暖色 1 灯。動的ライト 2 灯のみ) ---
    const lighting = new Group()
    const hemi = new HemisphereLight('#2a3360', '#1a1430', 0.85)
    lighting.add(hemi)
    const warm = new PointLight(COLOR_BULB, 1.4, 8, 2)
    warm.position.set(0.3, 1.6, 0.6)
    lighting.add(warm)
    this.lightingLights.push(hemi, warm)
    this.scene.add(lighting)
  }

  enter(ctx: SceneContext): void {
    this.events = ctx.events
    this.input = ctx.input

    this.session = new SuperballSession()
    this.finishedEmitted = false

    this.prevSubmerged = false
    this.prevSpaceDown = ctx.input.isDown('Space')
    this.prevMousePressed = ctx.input.mouse.pressed
    this.prevEscDown = ctx.input.isDown('Escape')
    this.spaceToggleSubmerged = 0

    this.poiTarget.x = 0
    this.poiTarget.z = 0

    for (const m of this.bowlBallMeshes) m.visible = false

    this.emitHud()
  }

  exit(): void {
    this.hudListener?.(null)
    this.events = null
    this.input = null
    this.session = null
  }

  update(dt: number): void {
    const session = this.session
    const input = this.input
    if (!session || !input) return
    if (session.status !== 'playing') return

    const sbInput = this.buildInput(dt)
    const sbEvents = session.update(dt, sbInput)

    const instructions: SuperballEmit[] = []
    for (const ins of mapSuperballSubmergeEdge(this.prevSubmerged, sbInput.submerge)) instructions.push(ins)
    for (const ins of mapSuperballEvents(sbEvents)) instructions.push(ins)
    this.flush(instructions)
    this.prevSubmerged = sbInput.submerge

    this.emitHud()
  }

  render(_alpha: number): void {
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

  // --- 入力組み立て(金魚すくいと同パターン。マウス/キーボード両完結) ---

  private buildInput(dt: number): SuperballInput {
    const input = this.input!

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

    const overBowl = isOverBowl(this.poiTarget, this.bowlCenter, BOWL_RADIUS)

    const spaceDown = input.isDown('Space')
    const spaceToggledOn = spaceDown && !this.prevSpaceDown
    if (spaceDown && !this.prevSpaceDown) {
      this.spaceToggleSubmerged = this.spaceToggleSubmerged === 1 ? 0 : 1
    }
    this.prevSpaceDown = spaceDown

    const mousePressed = input.mouse.pressed
    const mouseEdgeDown = mousePressed && !this.prevMousePressed
    this.prevMousePressed = mousePressed

    let secure = false
    if (overBowl && (mouseEdgeDown || spaceToggledOn)) secure = true

    const submerge = !overBowl && (mousePressed || this.spaceToggleSubmerged === 1)

    const escDown = input.isDown('Escape')
    const quit = escDown && !this.prevEscDown
    this.prevEscDown = escDown

    this.inputBuf.target = this.poiTarget
    this.inputBuf.submerge = submerge
    this.inputBuf.secure = secure
    this.inputBuf.quit = quit
    return this.inputBuf
  }

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

  private flush(instructions: readonly SuperballEmit[]): void {
    const events = this.events
    if (!events) return
    for (const ins of instructions) {
      if (ins.event === 'stall-finished') {
        this.emitFinished(ins.result)
      } else {
        events.emit('sfx:play', ins.payload)
      }
    }
  }

  private emitFinished(result: StallResult): void {
    if (this.finishedEmitted) return
    this.finishedEmitted = true
    this.events?.emit('stall:finished', { stallId: this.stallId, result })
  }

  // --- 描画同期 ---

  private syncVisuals(snap: SuperballState): void {
    const poi = snap.poi
    const poiY = poi.submerged ? POI_LIFT_Y - poi.depth : POI_LIFT_Y
    this.poiGroup.position.set(poi.position.x, poiY, poi.position.z)

    let opacity = PAPER_OPACITY_MIN + (PAPER_OPACITY_FULL - PAPER_OPACITY_MIN) * poi.durabilityRatio
    if (poi.durabilityRatio <= PAPER_WARNING_RATIO) {
      const t = poi.durabilityRatio / PAPER_WARNING_RATIO
      opacity *= 0.55 + 0.45 * t
    }
    this.poiPaperMaterial.opacity = opacity

    // 水面のボール(floating/onPoi のみ描く。secured はお椀へ)。
    const balls = snap.balls
    for (let i = 0; i < this.ballMeshes.length; i++) {
      const m = this.ballMeshes[i]
      const bs: BallState | undefined = balls[i]
      if (!bs || bs.status === 'secured') {
        m.visible = false
        continue
      }
      m.visible = true
      m.material = this.ballMaterials[bs.colorIndex % this.ballMaterials.length]
      // bob(上下の弾み)。onPoi は紙の上に乗る高さ。
      const bob = Math.sin(bs.bobPhase) * 0.008
      const y = bs.status === 'onPoi' ? poiY + BALL_RADIUS : BALL_FLOAT_Y + bob
      m.position.set(bs.position.x, y, bs.position.z)
    }

    this.updateBowlBalls(balls, snap.secured)
  }

  /** お椀の中に確保済みのボールを並べる(確保数に追従。色は確保したボールの色を引き継ぐ)。 */
  private updateBowlBalls(balls: readonly BallState[], secured: number): void {
    // 確保済みボールの色 index を収集(描画用)。
    const securedColors: number[] = []
    for (const b of balls) {
      if (b.status === 'secured') securedColors.push(b.colorIndex)
    }
    for (let i = 0; i < this.bowlBallMeshes.length; i++) {
      const m = this.bowlBallMeshes[i]
      if (i < secured) {
        m.visible = true
        const colorIndex = securedColors[i] ?? 0
        m.material = this.ballMaterials[colorIndex % this.ballMaterials.length]
        const a = (i / Math.max(1, secured)) * Math.PI * 2
        const r = secured > 1 ? BOWL_RADIUS * 0.42 : 0
        m.position.set(Math.cos(a) * r, BALL_RADIUS, Math.sin(a) * r)
        m.scale.setScalar(0.85)
      } else {
        m.visible = false
      }
    }
  }

  // --- HUD ---

  private emitHud(): void {
    const snap = this.session?.snapshot()
    if (!snap) return
    this.hudListener?.({
      active: true,
      displayName: this.displayName,
      timeRemaining: snap.timeRemaining,
      gauge: { ratio: snap.poi.durabilityRatio, label: 'ポイ' },
      score: snap.secured,
      scoreLabel: 'すくった',
      scoreUnit: '個',
      hint: SUPERBALL_HINT,
    })
  }

  // --- カメラ ---

  private placeCamera(): void {
    const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180
    const y = CAMERA_DISTANCE * Math.sin(pitch)
    const z = CAMERA_DISTANCE * Math.cos(pitch)
    this.camera.position.set(0, y, z)
    this.camera.lookAt(0, CAMERA_TARGET_Y, 0)
  }
}
