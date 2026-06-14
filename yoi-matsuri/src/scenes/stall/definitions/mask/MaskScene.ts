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
  PlaneGeometry,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene as ThreeScene,
  Shape,
  ShapeGeometry,
  Vector2,
  type Object3D,
  type WebGLRenderer,
} from 'three'
import type { SceneContext } from '../../../../core/SceneManager'
import type { EventBus } from '../../../../core/EventBus'
import type { InputManager } from '../../../../core/InputManager'
import type { StallResult } from '../../../../game/stall'
import type { StallScene, StallHudState } from '../../types'
import { MaskSession, MASK_KINDS, type MaskInput, type MaskState } from '../../../../game/mask'
import { mapMaskEvents, type MaskEmit } from './eventMap'

// --- ART §2 パレット(お面屋。すべて §2 + 花火3色の既存パレット内) ---
const COLOR_FOG = 0x141a38
const COLOR_BOARD = '#3a3148' // 壁(お面を掛ける板)= 参道の土色派生(夜に沈んだ木)
const COLOR_BULB = '#ffd166'
const COLOR_FOCUS = '#ff9d45' // フォーカス枠 = UIアクセント(提灯紙)

// --- カメラ: お面の壁を正面から見る(俯瞰ではない。CHOICE は選ぶ体験) ---
const CAMERA_FOV = 45
const CAMERA_Z = 2.6
const CAMERA_Y = 0.05

// --- お面の配置 ---
const MASK_RADIUS = 0.32 // お面の見た目半径 [m]
const MASK_SPACING = 0.78 // 隣り合うお面の中心間隔 [m]
const FOCUS_SCALE = 1.16 // フォーカス中のお面の拡大率

/** お面屋の屋号(汎用 HUD・結果見出しに使う表示名)。 */
export const MASK_DISPLAY_NAME = 'お面屋'

/** お面屋の操作ヒント(開始 2 秒だけ表示)。 */
export const MASK_HINT = '←→で選んで、Enter/クリックで決める'

interface MaskVisual {
  group: Group
  /** レイキャスト対象(顔の面)。userData.index に候補 index を持つ。 */
  hit: Mesh
  /** フォーカス枠(リング)。フォーカス時のみ可視。 */
  focusRing: Mesh
  baseX: number
}

/** 三角形 ShapeGeometry を生成するヘルパー。 */
function makeTriangle(halfBase: number, height: number): ShapeGeometry {
  const s = new Shape()
  s.moveTo(-halfBase, 0)
  s.lineTo(halfBase, 0)
  s.lineTo(0, height)
  s.closePath()
  return new ShapeGeometry(s)
}

/**
 * お面屋シーン(CHOICE 原型 / 屋台#19 / P2 量産実証)。
 *
 * 屋台フレームワークの StallScene として駆動される。MaskSession を唯一の真実として、壁に並んだ
 * 複数のお面(プロシージャル: 種別ごとの特徴的なジオメトリ、ART §2 パレット + §8 お面造形原則)を
 * 正面カメラで描画する。**物理なし**(選ぶ体験)。
 *
 * 入力(マウス・キーボード両完結):
 *  - キーボード: ←→ でフォーカス移動 / Enter で確定 / Esc で退出。
 *  - マウス: お面にカーソルを重ねるとフォーカス / クリックで確定。
 * フォーカス中のお面は拡大 + 暖色の枠で強調する(§3 予兆は不要だが選択中は明示)。
 *
 * GPU リソースは dispose() で全解放(idempotent)。update 内でフレーム毎の new を行わない。
 */
export class MaskScene implements StallScene {
  readonly id = 'minigame' as const

  private readonly renderer: WebGLRenderer
  private readonly scene: ThreeScene
  private readonly camera: PerspectiveCamera

  private session: MaskSession | null = null
  private finishedEmitted = false

  private events: EventBus | null = null
  private input: InputManager | null = null
  private hudListener: ((state: StallHudState | null) => void) | null = null

  setHudListener(listener: (state: StallHudState | null) => void): void {
    this.hudListener = listener
  }

  private readonly masks: MaskVisual[] = []
  private readonly hitMeshes: Mesh[] = []

  private readonly geometries: { dispose(): void }[] = []
  private readonly disposableMaterials: { dispose(): void }[] = []
  private readonly lightingLights: { dispose(): void }[] = []
  private disposed = false

  // --- 入力エッジ状態 ---
  private prevLeftDown = false
  private prevRightDown = false
  private prevEnterDown = false
  private prevMousePressed = false
  private prevEscDown = false

  // --- レイキャストワーク(フレーム毎アロケーション回避) ---
  private readonly raycaster = new Raycaster()
  private readonly ndc = new Vector2()
  private readonly inputBuf: { move: -1 | 0 | 1; focusIndex: number | null; confirm: boolean; quit: boolean } = {
    move: 0,
    focusIndex: null,
    confirm: false,
    quit: false,
  }

  private readonly stallId: string
  private readonly displayName: string

  constructor(renderer: WebGLRenderer, stallId: string, displayName: string = MASK_DISPLAY_NAME) {
    this.renderer = renderer
    this.stallId = stallId
    this.displayName = displayName
    this.scene = new ThreeScene()
    this.scene.fog = new FogExp2(COLOR_FOG, 0.06)
    this.scene.background = new Color(COLOR_FOG)

    const size = renderer.getSize(new Vector2())
    const aspect = size.y > 0 ? size.x / size.y : 16 / 9
    this.camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.05, 50)
    this.camera.position.set(0, CAMERA_Y, CAMERA_Z)
    this.camera.lookAt(0, 0, 0)

    const track = <T extends { dispose(): void }>(g: T): T => {
      this.geometries.push(g)
      return g
    }

    const n = MASK_KINDS.length

    // --- 背板(お面を掛ける壁) ---
    const boardGeo = track(new PlaneGeometry(MASK_SPACING * n + 0.6, 1.5))
    const boardMat = new MeshStandardMaterial({ color: COLOR_BOARD, roughness: 1, metalness: 0 })
    const board = new Mesh(boardGeo, boardMat)
    board.position.set(0, 0, -0.2)
    this.scene.add(board)
    this.disposableMaterials.push(boardMat)

    // --- フォーカス枠ジオメトリ(共通) ---
    const focusGeo = track(new RingGeometry(MASK_RADIUS * 1.05, MASK_RADIUS * 1.18, 40))

    const startX = -((n - 1) * MASK_SPACING) / 2
    for (let i = 0; i < n; i++) {
      const kind = MASK_KINDS[i]
      const group = new Group()
      const baseX = startX + i * MASK_SPACING
      group.position.set(baseX, 0, 0)

      // 顔の面(地色)。レイキャスト対象。種別によって縦横比を変える。
      // ひょっとこは暖橙(#ff9d45)がライティング下でも読めるよう emissiveIntensity を高めに設定する。
      const faceEmissiveIntensity = kind.id === 'mask:hyottoko' ? 0.55 : 0.22
      const faceGeo = track(new CircleGeometry(MASK_RADIUS, 40))
      const faceMat = new MeshStandardMaterial({
        color: kind.faceColor,
        emissive: new Color(kind.faceColor),
        emissiveIntensity: faceEmissiveIntensity, // 夜でも色・表情が読める
        roughness: 0.6,
        metalness: 0,
      })
      const face = new Mesh(faceGeo, faceMat)
      face.userData.index = i

      // 種別ごとの顔の縦横比変形
      if (kind.id === 'mask:hyottoko') {
        face.scale.y = 0.92 // §8-2: ひょっとこは縦に少し扁平
      } else if (kind.id === 'mask:anime') {
        face.scale.y = 1.08 // §8-5: アニメ風はタマゴ型(縦に伸ばす)
      }

      group.add(face)
      this.disposableMaterials.push(faceMat)

      // --- 種別ごとの造形(§8 お面造形原則) ---
      const accentMat = new MeshBasicMaterial({ color: kind.accentColor })
      this.disposableMaterials.push(accentMat)

      if (kind.id === 'mask:kitsune') {
        // §8-1: キツネ — 耳(三角)・内耳・ツリ目(横楕円)・逆三角鼻・細い弧の口
        // 耳(白: 顔の後ろ z=-0.01 でシルエット)
        const earGeo = track(makeTriangle(MASK_RADIUS * 0.35 / 2, MASK_RADIUS * 0.55))
        const earMat = new MeshBasicMaterial({ color: kind.faceColor })
        this.disposableMaterials.push(earMat)
        const leftEar = new Mesh(earGeo, earMat)
        leftEar.position.set(-MASK_RADIUS * 0.68, MASK_RADIUS * 0.82, -0.01)
        const rightEar = new Mesh(earGeo, earMat)
        rightEar.position.set(MASK_RADIUS * 0.68, MASK_RADIUS * 0.82, -0.01)
        group.add(leftEar, rightEar)

        // 内耳(朱: 耳の前面 z=+0.005)
        const innerEarGeo = track(makeTriangle(MASK_RADIUS * 0.35 * 0.65 / 2, MASK_RADIUS * 0.55 * 0.65))
        const leftInnerEar = new Mesh(innerEarGeo, accentMat)
        leftInnerEar.position.set(-MASK_RADIUS * 0.68, MASK_RADIUS * 0.82 + MASK_RADIUS * 0.55 * 0.175, 0.005)
        const rightInnerEar = new Mesh(innerEarGeo, accentMat)
        rightInnerEar.position.set(MASK_RADIUS * 0.68, MASK_RADIUS * 0.82 + MASK_RADIUS * 0.55 * 0.175, 0.005)
        group.add(leftInnerEar, rightInnerEar)

        // ツリ目(横楕円 scale.x=2.0)
        const eyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.10, 16))
        const leftEye = new Mesh(eyeGeo, accentMat)
        leftEye.scale.x = 2.0
        leftEye.position.set(-MASK_RADIUS * 0.34, MASK_RADIUS * 0.22, 0.01)
        const rightEye = new Mesh(eyeGeo, accentMat)
        rightEye.scale.x = 2.0
        rightEye.position.set(MASK_RADIUS * 0.34, MASK_RADIUS * 0.22, 0.01)
        group.add(leftEye, rightEye)

        // 逆三角鼻
        const noseGeo = track(makeTriangle(MASK_RADIUS * 0.14 / 2, MASK_RADIUS * 0.10))
        const nose = new Mesh(noseGeo, accentMat)
        nose.rotation.z = Math.PI // 逆三角形
        nose.position.set(0, 0.0 + MASK_RADIUS * 0.05, 0.01)
        group.add(nose)

        // 細い弧の口(アーク角 0.5π)
        const mouthGeo = track(new RingGeometry(MASK_RADIUS * 0.22, MASK_RADIUS * 0.30, 24, 1, Math.PI * 1.25, Math.PI * 0.5))
        const mouth = new Mesh(mouthGeo, accentMat)
        mouth.position.set(0, -MASK_RADIUS * 0.42, 0.01)
        group.add(mouth)

      } else if (kind.id === 'mask:hyottoko') {
        // §8-2: ひょっとこ — 左寄り楕円口(最重要)・左右非対称の目・外下がり眉

        // 口(最重要): 左寄りの楕円
        const mouthGeo = track(new CircleGeometry(MASK_RADIUS * 0.20, 16))
        const mouth = new Mesh(mouthGeo, accentMat)
        mouth.scale.x = 0.85
        mouth.position.set(-MASK_RADIUS * 0.22, -MASK_RADIUS * 0.30, 0.01)
        group.add(mouth)

        // 目(左): 通常サイズ
        const leftEyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.13, 16))
        const leftEye = new Mesh(leftEyeGeo, accentMat)
        leftEye.position.set(-MASK_RADIUS * 0.34, MASK_RADIUS * 0.18, 0.01)
        group.add(leftEye)

        // 目(右): 小さく横扁平(閉じ気味)
        const rightEyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.08, 16))
        const rightEye = new Mesh(rightEyeGeo, accentMat)
        rightEye.scale.y = 0.5
        rightEye.position.set(MASK_RADIUS * 0.34, MASK_RADIUS * 0.15, 0.01)
        group.add(rightEye)

        // 眉(左): 外下がり
        const leftBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.25, MASK_RADIUS * 0.06))
        const leftBrow = new Mesh(leftBrowGeo, accentMat)
        leftBrow.rotation.z = 0.15
        leftBrow.position.set(-MASK_RADIUS * 0.34, MASK_RADIUS * 0.36, 0.01)
        group.add(leftBrow)

        // 眉(右): より急な外下がり
        const rightBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.25, MASK_RADIUS * 0.06))
        const rightBrow = new Mesh(rightBrowGeo, accentMat)
        rightBrow.rotation.z = -0.35
        rightBrow.position.set(MASK_RADIUS * 0.34, MASK_RADIUS * 0.33, 0.01)
        group.add(rightBrow)

      } else if (kind.id === 'mask:okame') {
        // §8-3: おかめ — 大きな丸頬(最重要)・小さい目・極小鼻・下げた口弧・短い水平眉

        // 頬(最重要): 桃色の大きな丸
        const cheekMat = new MeshBasicMaterial({ color: '#ff6b9d' })
        this.disposableMaterials.push(cheekMat)
        const cheekGeo = track(new CircleGeometry(MASK_RADIUS * 0.28, 16))
        const leftCheek = new Mesh(cheekGeo, cheekMat)
        leftCheek.position.set(-MASK_RADIUS * 0.60, -MASK_RADIUS * 0.10, 0.005)
        const rightCheek = new Mesh(cheekGeo, cheekMat)
        rightCheek.position.set(MASK_RADIUS * 0.60, -MASK_RADIUS * 0.10, 0.005)
        group.add(leftCheek, rightCheek)

        // 目: 小さめ 2 点(径 0.85 倍)
        const eyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.11, 16))
        const leftEye = new Mesh(eyeGeo, accentMat)
        leftEye.position.set(-MASK_RADIUS * 0.30, MASK_RADIUS * 0.20, 0.01)
        const rightEye = new Mesh(eyeGeo, accentMat)
        rightEye.position.set(MASK_RADIUS * 0.30, MASK_RADIUS * 0.20, 0.01)
        group.add(leftEye, rightEye)

        // 鼻: 極小の正円(顔色系)
        const noseMat = new MeshBasicMaterial({ color: '#e0dbd0' })
        this.disposableMaterials.push(noseMat)
        const noseGeo = track(new CircleGeometry(MASK_RADIUS * 0.07, 12))
        const nose = new Mesh(noseGeo, noseMat)
        nose.position.set(0, MASK_RADIUS * 0.05, 0.01)
        group.add(nose)

        // 口: 小さな弧。下へ下げ、アーク角 0.45π。色=差し色(桃)
        const mouthMat = new MeshBasicMaterial({ color: '#ff6b9d' })
        this.disposableMaterials.push(mouthMat)
        const mouthGeo = track(new RingGeometry(MASK_RADIUS * 0.22, MASK_RADIUS * 0.30, 24, 1, Math.PI * 1.275, Math.PI * 0.45))
        const mouth = new Mesh(mouthGeo, mouthMat)
        mouth.position.set(0, -MASK_RADIUS * 0.48, 0.01)
        group.add(mouth)

        // 眉: 短い帯を水平に近い角度で(額中心寄り)
        const leftBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.18, MASK_RADIUS * 0.05))
        const leftBrow = new Mesh(leftBrowGeo, accentMat)
        leftBrow.position.set(-MASK_RADIUS * 0.25, MASK_RADIUS * 0.40, 0.01)
        group.add(leftBrow)
        const rightBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.18, MASK_RADIUS * 0.05))
        const rightBrow = new Mesh(rightBrowGeo, accentMat)
        rightBrow.position.set(MASK_RADIUS * 0.25, MASK_RADIUS * 0.40, 0.01)
        group.add(rightBrow)

      } else if (kind.id === 'mask:hannya') {
        // §8-4: 般若 — 角2本(最重要)・逆ハの字眉・横扁平目・広い怒り口弧・牙2本・鼻

        // 角(最重要): 顔の後ろ z=-0.01 でシルエット上に突き出す
        const leftHornGeo = track(makeTriangle(MASK_RADIUS * 0.22 / 2, MASK_RADIUS * 0.45))
        const rightHornGeo = track(makeTriangle(MASK_RADIUS * 0.22 / 2, MASK_RADIUS * 0.45))
        const leftHorn = new Mesh(leftHornGeo, accentMat)
        leftHorn.rotation.z = 0.15 // 内傾き
        leftHorn.position.set(-MASK_RADIUS * 0.48, MASK_RADIUS * 0.80, -0.01)
        const rightHorn = new Mesh(rightHornGeo, accentMat)
        rightHorn.rotation.z = -0.15 // 内傾き(反対)
        rightHorn.position.set(MASK_RADIUS * 0.48, MASK_RADIUS * 0.80, -0.01)
        group.add(leftHorn, rightHorn)

        // 眉(逆ハの字): 眉間に寄せ急傾斜
        const leftBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.32, MASK_RADIUS * 0.08))
        const leftBrow = new Mesh(leftBrowGeo, accentMat)
        leftBrow.rotation.z = 0.50
        leftBrow.position.set(-MASK_RADIUS * 0.28, MASK_RADIUS * 0.30, 0.01)
        group.add(leftBrow)
        const rightBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.32, MASK_RADIUS * 0.08))
        const rightBrow = new Mesh(rightBrowGeo, accentMat)
        rightBrow.rotation.z = -0.50
        rightBrow.position.set(MASK_RADIUS * 0.28, MASK_RADIUS * 0.30, 0.01)
        group.add(rightBrow)

        // 目: 横長扁平(怒り目)
        const eyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.10, 16))
        const leftEye = new Mesh(eyeGeo, accentMat)
        leftEye.scale.x = 2.5
        leftEye.scale.y = 0.45
        leftEye.position.set(-MASK_RADIUS * 0.34, MASK_RADIUS * 0.12, 0.01)
        group.add(leftEye)
        const rightEyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.10, 16))
        const rightEye = new Mesh(rightEyeGeo, accentMat)
        rightEye.scale.x = 2.5
        rightEye.scale.y = 0.45
        rightEye.position.set(MASK_RADIUS * 0.34, MASK_RADIUS * 0.12, 0.01)
        group.add(rightEye)

        // 口: 広い弧(怒り笑い)
        const mouthGeo = track(new RingGeometry(MASK_RADIUS * 0.40, MASK_RADIUS * 0.50, 24, 1, -0.25 * Math.PI, 1.50 * Math.PI))
        const mouth = new Mesh(mouthGeo, accentMat)
        mouth.position.set(0, -MASK_RADIUS * 0.26, 0.01)
        group.add(mouth)

        // 牙(左右): 顔下端から突き出る白い三角
        const fangMat = new MeshBasicMaterial({ color: '#f5f0e8' })
        this.disposableMaterials.push(fangMat)
        const leftFangGeo = track(makeTriangle(MASK_RADIUS * 0.11 / 2, MASK_RADIUS * 0.14))
        const leftFang = new Mesh(leftFangGeo, fangMat)
        leftFang.rotation.z = Math.PI // 下向き
        leftFang.position.set(-MASK_RADIUS * 0.22, -MASK_RADIUS * 0.88, 0.01)
        group.add(leftFang)
        const rightFangGeo = track(makeTriangle(MASK_RADIUS * 0.11 / 2, MASK_RADIUS * 0.14))
        const rightFang = new Mesh(rightFangGeo, fangMat)
        rightFang.rotation.z = Math.PI // 下向き
        rightFang.position.set(MASK_RADIUS * 0.22, -MASK_RADIUS * 0.88, 0.01)
        group.add(rightFang)

        // 鼻: 低く横長
        const noseGeo = track(new CircleGeometry(MASK_RADIUS * 0.08, 12))
        const nose = new Mesh(noseGeo, accentMat)
        nose.scale.x = 1.5
        nose.position.set(0, 0, 0.01)
        group.add(nose)

      } else if (kind.id === 'mask:anime') {
        // §8-5: アニメ風 — 横長の大きな瞳(最重要)・睫毛ライン・V字口・照れ線・太眉

        // 目(最重要): 大きめ横楕円
        const leftEyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.14, 20))
        const leftEye = new Mesh(leftEyeGeo, accentMat)
        leftEye.scale.x = 2.0
        leftEye.scale.y = 0.9
        leftEye.position.set(-MASK_RADIUS * 0.30, MASK_RADIUS * 0.16, 0.01)
        group.add(leftEye)

        const rightEyeGeo = track(new CircleGeometry(MASK_RADIUS * 0.14, 20))
        const rightEye = new Mesh(rightEyeGeo, accentMat)
        rightEye.scale.x = 2.0
        rightEye.scale.y = 0.9
        rightEye.position.set(MASK_RADIUS * 0.30, MASK_RADIUS * 0.16, 0.01)
        group.add(rightEye)

        // 睫毛ライン(目の上の細帯): 暗色
        const lashMat = new MeshBasicMaterial({ color: '#1a1a22' })
        this.disposableMaterials.push(lashMat)
        const leftLashGeo = track(new PlaneGeometry(MASK_RADIUS * 0.30, MASK_RADIUS * 0.030))
        const leftLash = new Mesh(leftLashGeo, lashMat)
        leftLash.position.set(-MASK_RADIUS * 0.30, MASK_RADIUS * 0.26, 0.015)
        group.add(leftLash)
        const rightLashGeo = track(new PlaneGeometry(MASK_RADIUS * 0.30, MASK_RADIUS * 0.030))
        const rightLash = new Mesh(rightLashGeo, lashMat)
        rightLash.position.set(MASK_RADIUS * 0.30, MASK_RADIUS * 0.26, 0.015)
        group.add(rightLash)

        // 口: V字(ShapeGeometry で逆V字笑顔。左右下へ折れる2辺)
        // lineW=0.07 (0.05→0.07)に太くし、金地(#ffd166)との対比を上げるため暗色マテリアルを使う
        const mouthShape = new Shape()
        mouthShape.moveTo(-MASK_RADIUS * 0.35, -MASK_RADIUS * 0.42)
        mouthShape.lineTo(0, -MASK_RADIUS * 0.20)
        mouthShape.lineTo(MASK_RADIUS * 0.35, -MASK_RADIUS * 0.42)
        // 太さをもたせるためオフセット辺を描く
        const lineW = MASK_RADIUS * 0.07
        mouthShape.lineTo(MASK_RADIUS * 0.35 - lineW * 0.3, -MASK_RADIUS * 0.42 + lineW)
        mouthShape.lineTo(0, -MASK_RADIUS * 0.20 + lineW * 1.2)
        mouthShape.lineTo(-MASK_RADIUS * 0.35 + lineW * 0.3, -MASK_RADIUS * 0.42 + lineW)
        mouthShape.closePath()
        const mouthGeo = track(new ShapeGeometry(mouthShape))
        // §8-5: V字口は金地との対比を確保するため lashMat(暗色 #1a1a22)を使う
        const mouth = new Mesh(mouthGeo, lashMat)
        mouth.position.set(0, 0, 0.01)
        group.add(mouth)

        // 照れ線(目の下の横線2本)
        const blusherMat = new MeshBasicMaterial({ color: kind.accentColor, transparent: true, opacity: 0.6 })
        this.disposableMaterials.push(blusherMat)
        const leftBlusherGeo = track(new PlaneGeometry(MASK_RADIUS * 0.22, MASK_RADIUS * 0.025))
        const leftBlusher = new Mesh(leftBlusherGeo, blusherMat)
        leftBlusher.position.set(-MASK_RADIUS * 0.30, MASK_RADIUS * 0.00, 0.01)
        group.add(leftBlusher)
        const rightBlusherGeo = track(new PlaneGeometry(MASK_RADIUS * 0.22, MASK_RADIUS * 0.025))
        const rightBlusher = new Mesh(rightBlusherGeo, blusherMat)
        rightBlusher.position.set(MASK_RADIUS * 0.30, MASK_RADIUS * 0.00, 0.01)
        group.add(rightBlusher)

        // 眉(太め帯を平行に)
        const leftBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.24, MASK_RADIUS * 0.07))
        const leftBrow = new Mesh(leftBrowGeo, lashMat)
        leftBrow.position.set(-MASK_RADIUS * 0.30, MASK_RADIUS * 0.38, 0.01)
        group.add(leftBrow)
        const rightBrowGeo = track(new PlaneGeometry(MASK_RADIUS * 0.24, MASK_RADIUS * 0.07))
        const rightBrow = new Mesh(rightBrowGeo, lashMat)
        rightBrow.position.set(MASK_RADIUS * 0.30, MASK_RADIUS * 0.38, 0.01)
        group.add(rightBrow)
      }

      // フォーカス枠(暖色リング。初期非表示)。
      const focusMat = new MeshBasicMaterial({ color: COLOR_FOCUS, transparent: true, opacity: 0.9 })
      const focusRing = new Mesh(focusGeo, focusMat)
      focusRing.position.z = -0.01
      focusRing.visible = false
      group.add(focusRing)
      this.disposableMaterials.push(focusMat)

      this.scene.add(group)
      this.masks.push({ group, hit: face, focusRing, baseX })
      this.hitMeshes.push(face)
    }

    // --- ライティング(寒色環境光 + 屋台の暖色 1 灯。動的ライト 2 灯のみ) ---
    const lighting = new Group()
    const hemi = new HemisphereLight('#2a3360', '#1a1430', 0.9)
    lighting.add(hemi)
    const warm = new PointLight(COLOR_BULB, 1.2, 8, 2)
    warm.position.set(0, 1.4, 1.4)
    lighting.add(warm)
    this.lightingLights.push(hemi, warm)
    this.scene.add(lighting)
  }

  enter(ctx: SceneContext): void {
    this.events = ctx.events
    this.input = ctx.input
    this.session = new MaskSession()
    this.finishedEmitted = false

    this.prevLeftDown = ctx.input.isDown('ArrowLeft')
    this.prevRightDown = ctx.input.isDown('ArrowRight')
    this.prevEnterDown = ctx.input.isDown('Enter')
    this.prevMousePressed = ctx.input.mouse.pressed
    this.prevEscDown = ctx.input.isDown('Escape')

    this.emitHud()
  }

  exit(): void {
    this.hudListener?.(null)
    this.events = null
    this.input = null
    this.session = null
  }

  update(_dt: number): void {
    const session = this.session
    const input = this.input
    if (!session || !input) return
    if (session.status !== 'playing') return

    const maskInput = this.buildInput()
    const maskEvents = session.update(_dt, maskInput)

    const instructions = mapMaskEvents(maskEvents)
    this.flush(instructions)

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

  // --- 入力組み立て(マウス/キーボード両完結) ---

  private buildInput(): MaskInput {
    const input = this.input!

    // キーボード ←→(立ち上がりで 1 段だけ動く)。
    const leftDown = input.isDown('ArrowLeft')
    const rightDown = input.isDown('ArrowRight')
    let move: -1 | 0 | 1 = 0
    if (leftDown && !this.prevLeftDown) move = -1
    else if (rightDown && !this.prevRightDown) move = 1
    this.prevLeftDown = leftDown
    this.prevRightDown = rightDown

    // マウス: ホバー中のお面を直接フォーカス。
    const focusIndex = this.pickMaskUnderCursor(input.mouse.x, input.mouse.y)

    // 確定: Enter / クリックの立ち上がり。
    const enterDown = input.isDown('Enter')
    const enterEdge = enterDown && !this.prevEnterDown
    this.prevEnterDown = enterDown
    const mousePressed = input.mouse.pressed
    const clickEdge = mousePressed && !this.prevMousePressed
    this.prevMousePressed = mousePressed
    // クリック確定は「お面の上」でのみ受ける(壁の余白クリックでは確定しない)。
    const confirm = enterEdge || (clickEdge && focusIndex !== null)

    // 退出。
    const escDown = input.isDown('Escape')
    const quit = escDown && !this.prevEscDown
    this.prevEscDown = escDown

    this.inputBuf.move = move
    this.inputBuf.focusIndex = focusIndex
    this.inputBuf.confirm = confirm
    this.inputBuf.quit = quit
    return this.inputBuf
  }

  /** カーソル下のお面 index を返す(なければ null)。レイキャストで顔の面に当てる。 */
  private pickMaskUnderCursor(clientX: number, clientY: number): number | null {
    const w = window.innerWidth
    const h = window.innerHeight
    if (w <= 0 || h <= 0) return null
    this.ndc.set((clientX / w) * 2 - 1, -((clientY / h) * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.hitMeshes as Object3D[], false)
    if (hits.length === 0) return null
    const idx = hits[0].object.userData.index
    return typeof idx === 'number' ? idx : null
  }

  private flush(instructions: readonly MaskEmit[]): void {
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

  private syncVisuals(snap: MaskState): void {
    for (let i = 0; i < this.masks.length; i++) {
      const m = this.masks[i]
      const focused = i === snap.focusedIndex && snap.chosenIndex < 0
      m.focusRing.visible = focused
      const scale = focused ? FOCUS_SCALE : 1
      m.group.scale.setScalar(scale)
      // フォーカス中のお面を少し前へ出す(奥行きで強調)。
      m.group.position.set(m.baseX, 0, focused ? 0.08 : 0)
    }
  }

  // --- HUD ---

  private emitHud(): void {
    const snap = this.session?.snapshot()
    if (!snap) return
    this.hudListener?.({
      active: true,
      displayName: this.displayName,
      timeRemaining: -1, // 制限時間なし(時間表示は出さない)
      gauge: null, // 物理ゲージなし
      score: snap.focusedIndex + 1,
      scoreLabel: 'えらび中',
      scoreUnit: `/${snap.count}`,
      hint: MASK_HINT,
    })
  }
}
