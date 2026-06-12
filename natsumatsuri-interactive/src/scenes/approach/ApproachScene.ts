import {
  BackSide,
  Color,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene as ThreeScene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  type WebGLRenderer,
} from 'three'
import type { Scene, SceneContext } from '../../core/SceneManager'

// ART_DIRECTION §2 カラーパレット
const SKY_TOP = new Color('#0a0e2e') // 夜空(上端)
const SKY_HORIZON = new Color('#1a2348') // 夜空(地平線)
const FOG_COLOR = 0x141a38 // フォグ
const GROUND_COLOR = '#3a3148' // 参道の土(純黒禁止)

// ART_DIRECTION §4 ライティング
const FOG_DENSITY = 0.028
const HEMI_SKY = '#2a3360'
const HEMI_GROUND = '#1a1430'
const HEMI_INTENSITY = 0.5

// ART_DIRECTION §5 カメラ(approach: 高さ3.2m・俯角15°・FOV 55°)
const CAMERA_FOV = 55
const CAMERA_HEIGHT = 3.2
const CAMERA_PITCH_DEG = -15

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
varying vec3 vWorldPosition;
void main() {
  // 地平線(h=0)から天頂(h=1)へのグラデーション
  float h = clamp(normalize(vWorldPosition).y, 0.0, 1.0);
  float t = pow(h, 0.6);
  gl_FragColor = vec4(mix(uHorizonColor, uTopColor, t), 1.0);
  // ShaderMaterialには自動付与されないため明示的にトーンマッピングとsRGB変換を適用する
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * 参道シーンの最小土台(T-001)。
 * 夜空グラデーション・フォグ・地面プレーンのみで「夜の空気」を成立させる。
 * 提灯・鳥居・屋台などの本格的な環境構築はT-002(environment-engineer)の範囲。
 */
export class ApproachScene implements Scene {
  readonly id = 'approach' as const

  private readonly renderer: WebGLRenderer
  private readonly scene: ThreeScene
  private readonly camera: PerspectiveCamera

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.scene = new ThreeScene()
    this.scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY)

    const size = renderer.getSize(new Vector2())
    const aspect = size.y > 0 ? size.x / size.y : 1
    this.camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 400)
    this.camera.position.set(0, CAMERA_HEIGHT, 5)
    this.camera.rotation.x = (CAMERA_PITCH_DEG * Math.PI) / 180

    this.scene.add(this.createSkyDome())
    this.scene.add(this.createGround())
    this.scene.add(new HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY))
  }

  enter(_ctx: SceneContext): void {
    // T-001時点では入場時の演出なし(T-002以降で環境・演出を足す)
  }

  exit(): void {
    // 退場時の後始末なし(シーンは常駐し再入場可能)
  }

  update(_dt: number): void {
    // T-001時点では動的要素なし(プレイヤー移動はT-003で実装)
  }

  render(_alpha: number): void {
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = height > 0 ? width / height : 1
    this.camera.updateProjectionMatrix()
  }

  /** 夜空: 内側を向いた大球に上下グラデーションのシェーダを貼る。フォグの影響は受けない。 */
  private createSkyDome(): Mesh {
    const geometry = new SphereGeometry(300, 24, 12)
    const material = new ShaderMaterial({
      uniforms: {
        uTopColor: { value: SKY_TOP },
        uHorizonColor: { value: SKY_HORIZON },
      },
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: BackSide,
      depthWrite: false,
      fog: false,
    })
    return new Mesh(geometry, material)
  }

  /**
   * 地面: 参道の土色の大プレーン。遠方はフォグに沈む。
   * T-001時点では提灯・屋台の光源(T-002)がまだ無いため、環境光だけでは土色が
   * ほぼ黒に沈む。土色のemissiveで「夜に沈んだ土」(純黒禁止)の明度を確保する。
   * T-002で光源が入ったらemissiveIntensityの調整・撤去を検討してよい。
   */
  private createGround(): Mesh {
    const geometry = new PlaneGeometry(400, 400)
    const material = new MeshLambertMaterial({
      color: GROUND_COLOR,
      emissive: GROUND_COLOR,
      emissiveIntensity: 0.9,
    })
    const ground = new Mesh(geometry, material)
    ground.rotation.x = -Math.PI / 2
    return ground
  }
}
