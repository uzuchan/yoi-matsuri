import {
  FogExp2,
  PerspectiveCamera,
  Scene as ThreeScene,
  Vector2,
  type WebGLRenderer,
} from 'three'
import type { Scene, SceneContext } from '../../core/SceneManager'
import {
  APPROACH,
  PALETTE,
  STALL_POSITION,
  computeCrowdPlacements,
  computeLanternAnchors,
  createCrowd,
  createGround,
  createLanterns,
  createLighting,
  createSky,
  createStall,
  createTorii,
  pickRepresentativeLanterns,
  type ContactCircle,
  type WorldObject,
} from '../../world'

// ART_DIRECTION §4 フォグ
const FOG_DENSITY = 0.028

// ART_DIRECTION §5 カメラ(approach: 高さ3.2m・俯角15°・FOV 55°)
const CAMERA_FOV = 55
const CAMERA_HEIGHT = 3.2
const CAMERA_PITCH_DEG = -15

// 提灯PointLightの代表灯数(ART §4: 4灯まで)。
const LANTERN_LIGHT_COUNT = 4

/**
 * 参道シーン(T-002)。夜空・フォグ・地面の上に、提灯列・鳥居・金魚すくい屋台(外観)・
 * 群衆シルエット・夜のライティングを組み立て、ART_DIRECTION の「寒色の夜 × 暖色の灯り」を成立させる。
 *
 * world/ のビルダー(WorldObject)を構築時に一度だけ生成し、毎フレームの新規アロケーションを行わない。
 * 動的要素(提灯の揺れ)は update(dt) で WorldObject.update を駆動する。
 * GPUリソースは dispose() で全解放する(idempotent)。
 *
 * プレイヤー移動・追従カメラ・屋台近接判定は T-003 の範囲(本シーンは固定カメラ)。
 */
export class ApproachScene implements Scene {
  readonly id = 'approach' as const

  private readonly renderer: WebGLRenderer
  private readonly scene: ThreeScene
  private readonly camera: PerspectiveCamera

  /** 構築した全 WorldObject。update / dispose をまとめて駆動する。 */
  private readonly worldObjects: WorldObject[]
  /** update を持つ WorldObject のみ(揺れ等)。毎フレームのフィルタリングを避けるため事前抽出。 */
  private readonly animated: WorldObject[]
  private disposed = false

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.scene = new ThreeScene()
    this.scene.fog = new FogExp2(PALETTE.fog, FOG_DENSITY)

    const size = renderer.getSize(new Vector2())
    const aspect = size.y > 0 ? size.x / size.y : 1
    this.camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 400)
    this.camera.position.set(0, CAMERA_HEIGHT, 5)
    this.camera.rotation.x = (CAMERA_PITCH_DEG * Math.PI) / 180

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

    this.worldObjects = [sky, ground, lighting, lanterns, torii, stall, crowd]
    for (const w of this.worldObjects) {
      this.scene.add(w.object)
    }
    this.animated = this.worldObjects.filter((w) => typeof w.update === 'function')
  }

  enter(_ctx: SceneContext): void {
    // 固定カメラのため入場時の演出なし(プレイヤー移動・追従カメラは T-003)。
  }

  exit(): void {
    // シーンは常駐し再入場可能。退場時の後始末は不要(GPU解放は dispose で行う)。
  }

  update(dt: number): void {
    // 提灯の揺れなど動的要素のみ駆動(instanceMatrix の毎フレーム更新)。
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
