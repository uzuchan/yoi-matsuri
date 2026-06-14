import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
} from 'three'
import {
  BULB_COLOR,
  FESTIVAL_ACCENTS,
  PALETTE,
  jitter01,
  jitterRange,
} from './palette'
import { STALL_POSITION } from './stall'
import type { WorldObject } from './types'

/**
 * 参道の賑わい — 縁日屋台 約19軒(T-012)。
 *
 * ねらい(装飾。雰囲気のみ。**非インタラクティブ**): 既存の金魚すくい屋台(x=5,z=-26)に加え、
 * 多彩な屋台を参道両脇(歩行可能 x∈[-4,4] の外側 x≈±5.5)へ概ね等間隔に並べ、合計約20軒で
 * 「日本の縁日」の賑わいを作る。遊べるのは既存の金魚すくいのみ(近接プロンプトはそちらだけ)。
 *
 * 性能(ART §6 厳守):
 * - 屋根/柱/カウンター/紅白幕/裸電球/陳列品/暖簾(背板)/屋号サインは、すべて屋台をまたいで
 *   **InstancedMesh または 1 枚に結合した BufferGeometry** で描く(繰り返し要素のインスタンス化)。
 *   新規 draw call は約9(下記)に収め、屋台ごとに mesh を量産しない。
 * - 屋号サインは全屋台ぶんを **1 枚の CanvasTexture アトラス** に詰め、各サイン板の UV で
 *   セルを切り出す → 全サインで material/texture を共有し draw call は 1。
 * - 屋台ごとに **PointLight を足さない**(ART §4/§6: 動的ライトは既存6灯=提灯4+屋台1を超えない)。
 *   屋台の灯りは裸電球の emissive のみで表現する。
 * - geometry/material は構築時に一度だけ生成、フレーム毎の new なし、dispose() で全解放。
 *
 * 色(ART §2 厳守 / 新色なし): 屋根=幕赤 #c0392b / 紅白幕 #c0392b・#f5f0e8 / 裸電球 #ffd166 /
 * 木部(柱・カウンター)=土 #3a3148(夜に沈んだ木部。既存 stall.ts と同じ流用)。種類ごとの「差し色」
 * (陳列品・暖簾)は FESTIVAL_ACCENTS(= §2 既存色の再利用)から取る。
 */

/** 陳列品の形(low-poly の単純形状)。InstancedMesh は形ごとに 1 つ。 */
type ItemShape = 'sphere' | 'box' | 'stick'

/** 1 種類の屋台の定義(屋号・差し色・陳列品の形)。差し色は §2 既存色のみ。 */
interface StallKind {
  /** 屋号(日本語。canvas アトラスに描く。これが「日本の祭り」を一番伝える)。 */
  name: string
  /** 差し色(陳列品・暖簾。FESTIVAL_ACCENTS = ART §2 内)。 */
  accent: string
  /** 陳列品の形。 */
  item: ItemShape
}

/**
 * 屋台の種類(縁日らしい多彩さ。各軒で種類・色・陳列品・屋号が異なる)。
 * 既存の金魚すくい(別実装 stall.ts)を含めて約20種に見えるよう、ここは19種を定義する。
 * 差し色はすべて FESTIVAL_ACCENTS(ART §2 既存パレット内)。新色は持ち込まない。
 */
const STALL_KINDS: readonly StallKind[] = [
  { name: 'たこ焼き', accent: FESTIVAL_ACCENTS.candyRed, item: 'sphere' },
  { name: '焼きそば', accent: FESTIVAL_ACCENTS.warmAmber, item: 'box' },
  { name: 'りんご飴', accent: FESTIVAL_ACCENTS.candyRed, item: 'stick' },
  { name: 'わたがし', accent: FESTIVAL_ACCENTS.festPink, item: 'sphere' },
  { name: 'かき氷', accent: FESTIVAL_ACCENTS.festCyan, item: 'box' },
  { name: '射的', accent: FESTIVAL_ACCENTS.festYellow, item: 'box' },
  { name: '型抜き', accent: FESTIVAL_ACCENTS.festYellow, item: 'box' },
  { name: 'お面', accent: FESTIVAL_ACCENTS.paperWhite, item: 'sphere' },
  { name: 'くじ引き', accent: FESTIVAL_ACCENTS.festPink, item: 'box' },
  { name: 'チョコバナナ', accent: FESTIVAL_ACCENTS.warmAmber, item: 'stick' },
  { name: 'とうもろこし', accent: FESTIVAL_ACCENTS.festYellow, item: 'stick' },
  { name: 'カステラ', accent: FESTIVAL_ACCENTS.warmAmber, item: 'box' },
  { name: 'ラムネ', accent: FESTIVAL_ACCENTS.festCyan, item: 'stick' },
  { name: 'スーパーボール', accent: FESTIVAL_ACCENTS.festPink, item: 'sphere' },
  { name: '輪投げ', accent: FESTIVAL_ACCENTS.festYellow, item: 'box' },
  { name: 'たい焼き', accent: FESTIVAL_ACCENTS.curtainRed, item: 'box' },
  { name: '駄菓子', accent: FESTIVAL_ACCENTS.candyRed, item: 'sphere' },
  { name: 'あんず飴', accent: FESTIVAL_ACCENTS.warmAmber, item: 'stick' },
  { name: '焼きとうきび', accent: FESTIVAL_ACCENTS.festYellow, item: 'sphere' },
]

/** 新規屋台の総数(= 種類数)。既存の金魚すくい 1 軒と合わせて約20軒。 */
export const FESTIVAL_STALL_COUNT = STALL_KINDS.length

// --- 屋台の寸法(既存 stall.ts に揃えた low-poly。間口やや控えめで賑わいの密度を上げる) ---
const FRONTAGE = 2.6 // 間口(開口=参道側の幅)
const DEPTH = 1.8 // 奥行
const POST_HEIGHT = 2.3 // 柱の高さ(屋根まで)
const POST_THICK = 0.1
const ROOF_HEIGHT = 0.45
const ROOF_OVERHANG = 0.5
const COUNTER_HEIGHT = 0.85
const COUNTER_DEPTH = 0.45
const VALANCE_STRIPS = 6 // 紅白幕の短冊数(赤白交互)
const VALANCE_HEIGHT = 0.45
const BULBS_PER_STALL = 2
const ITEMS_PER_STALL = 6 // 陳列品(色とりどりの単純形状)

// --- 配置(参道両脇。歩行可能 x∈[-4,4] と提灯 x=±3.5 の外側) ---
const STALL_X = 5.6 // 参道中心からの横位置(|x|>4 / 提灯の外側)
const ROW_NEAR_Z = -4 // 入口側の最初の屋台 z
const ROW_FAR_Z = -56 // 鳥居(z=-60)手前の最後の屋台 z
/** 既存の金魚すくい屋台に新規屋台を重ねないための排除半径(z 方向)。 */
const GOLDFISH_CLEARANCE = 2.5

/** 1 軒ぶんの配置(テスト用に公開。決定論的)。 */
export interface FestivalStallPlacement {
  /** 屋台中心の x(左 = -STALL_X / 右 = +STALL_X)。 */
  x: number
  /** 屋台中心の z。 */
  z: number
  /** 開口(カウンター・屋号)が参道中心を向くための Y 回転(rad)。 */
  rotationY: number
  /** 種類 index(STALL_KINDS への参照)。 */
  kind: number
}

/**
 * 全新規屋台の配置を決定論的に算出する(index ベース。再現可能・テスト可能)。
 *
 * - 左右へ交互に振り分け、各側で入口(z=-4)→鳥居手前(z=-56)へ概ね等間隔に並べる。
 * - 右側は既存の金魚すくい屋台(STALL_POSITION x=5,z=-26)の z 近傍を空け、重ならないようにする
 *   (近接判定・遊技は既存屋台のみ。新規が塞がない)。
 * - 開口は参道中心(左屋台は +x、右屋台は -x)を向く。
 */
export function computeFestivalStallPlacements(): FestivalStallPlacement[] {
  const placements: FestivalStallPlacement[] = []
  // 左右の軒数(交互配分)。左 = 偶数 index、右 = 奇数 index。
  const leftCount = Math.ceil(STALL_KINDS.length / 2)
  const rightCount = STALL_KINDS.length - leftCount

  for (let kind = 0; kind < STALL_KINDS.length; kind++) {
    const side = kind % 2 === 0 ? -1 : 1 // 左(-1)/ 右(+1)
    const indexOnSide = Math.floor(kind / 2) // その側で何番目か
    const countOnSide = side === -1 ? leftCount : rightCount
    // 入口→鳥居手前へ等間隔(端を含む)。1 軒のみの側でも入口側に置く。
    const t = countOnSide > 1 ? indexOnSide / (countOnSide - 1) : 0
    let z = ROW_NEAR_Z + (ROW_FAR_Z - ROW_NEAR_Z) * t

    // 右側のみ: 既存の金魚すくい屋台(z=-26)に近すぎるスロットは鳥居側へずらして重なりを避ける。
    if (side === 1 && Math.abs(z - STALL_POSITION.z) < GOLDFISH_CLEARANCE) {
      z = STALL_POSITION.z - GOLDFISH_CLEARANCE
    }

    placements.push({
      x: side * STALL_X,
      z,
      // 左屋台は開口を +x(参道中心)へ、右屋台は -x へ向ける。
      rotationY: side === -1 ? Math.PI / 2 : -Math.PI / 2,
      kind,
    })
  }
  return placements
}

// 屋号サインのアトラス: 種類数を 5 列グリッドに詰める。
const SIGN_COLS = 5
const SIGN_ROWS = Math.ceil(STALL_KINDS.length / SIGN_COLS)
const SIGN_CELL_W = 256 // 1 セルの px 幅
const SIGN_CELL_H = 96 // 1 セルの px 高
const SIGN_ATLAS_W = SIGN_COLS * SIGN_CELL_W
const SIGN_ATLAS_H = SIGN_ROWS * SIGN_CELL_H

// 屋号サイン板(看板)のワールド寸法。屋根の前縁(開口側)に水平の看板として掛ける。
const SIGN_WORLD_W = FRONTAGE * 0.96
const SIGN_WORLD_H = (SIGN_WORLD_W * SIGN_CELL_H) / SIGN_CELL_W
// 紅白幕の少し下・カウンターより上の、視線に入る高さに掛ける(屋根/幕に隠れない)。
const SIGN_Y = POST_HEIGHT - 0.55
// 看板を開口面よりさらに参道側へ出して、柱・幕・電球より手前に置く(隠れ防止)。
const SIGN_FORWARD = 0.18

/**
 * 屋号アトラス(全種類の名前を 1 枚の CanvasTexture に詰める)を作る。
 * セル背景は夜空寄りの暗色(#0a0e2e)、文字は UIテキスト色 #f5f0e8(ART §2)+ 暖色縁取り(#ff9d45)。
 * 文字色・背景色はすべてパレット内。
 */
function createSignAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SIGN_ATLAS_W
  canvas.height = SIGN_ATLAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('festivalStalls: 2D canvas コンテキストを取得できませんでした')
  }
  ctx.clearRect(0, 0, SIGN_ATLAS_W, SIGN_ATLAS_H)

  for (let i = 0; i < STALL_KINDS.length; i++) {
    const col = i % SIGN_COLS
    const row = Math.floor(i / SIGN_COLS)
    const x0 = col * SIGN_CELL_W
    const y0 = row * SIGN_CELL_H

    // 看板の地: 屋台の幕(白)#f5f0e8 の不透明な木札風の地(夜でも読める明るい看板)。
    ctx.fillStyle = PALETTE.stallCurtainWhite
    ctx.fillRect(x0 + 6, y0 + 8, SIGN_CELL_W - 12, SIGN_CELL_H - 16)
    // 縁: 屋台の幕赤 #c0392b の枠(祭りの看板らしさ)。
    ctx.lineWidth = 6
    ctx.strokeStyle = PALETTE.stallCurtainRed
    ctx.strokeRect(x0 + 6, y0 + 8, SIGN_CELL_W - 12, SIGN_CELL_H - 16)

    // 屋号。間口に収まるよう、長い屋号は自動で字を詰める。
    const name = STALL_KINDS[i].name
    const basePx = 54
    const fitPx = Math.min(basePx, Math.floor(((SIGN_CELL_W - 28) / name.length) * 1.05))
    ctx.font = `800 ${fitPx}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = x0 + SIGN_CELL_W / 2
    const cy = y0 + SIGN_CELL_H / 2
    // 屋号は屋台の幕赤 #c0392b(白地×赤字=縁日の看板の定番。文字色はパレット内)。
    ctx.fillStyle = PALETTE.stallCurtainRed
    ctx.fillText(name, cx, cy)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  return texture
}

/**
 * 全屋号サインを 1 枚の BufferGeometry に結合する(各サインは自分のアトラスセルを指す UV を持つ)。
 * これにより全サインで texture/material を共有し draw call は 1。サインは各屋台のローカル原点を
 * 基準に配置されたワールド座標へ直接頂点を焼き込む(屋台の Group 回転は配置で吸収済み)。
 */
function buildSignsGeometry(placements: readonly FestivalStallPlacement[]): BufferGeometry {
  const quadCount = placements.length
  const positions = new Float32Array(quadCount * 4 * 3)
  const uvs = new Float32Array(quadCount * 4 * 2)
  const indices = new Uint16Array(quadCount * 6)

  const hw = SIGN_WORLD_W / 2
  const hh = SIGN_WORLD_H / 2

  for (let i = 0; i < quadCount; i++) {
    const p = placements[i]
    const kind = p.kind
    const col = kind % SIGN_COLS
    const row = Math.floor(kind / SIGN_COLS)
    // アトラス内 UV(canvas は上が y=0、テクスチャは下が v=0 なので row を反転)。
    const u0 = (col * SIGN_CELL_W) / SIGN_ATLAS_W
    const u1 = ((col + 1) * SIGN_CELL_W) / SIGN_ATLAS_W
    const v1 = 1 - (row * SIGN_CELL_H) / SIGN_ATLAS_H
    const v0 = 1 - ((row + 1) * SIGN_CELL_H) / SIGN_ATLAS_H

    // サイン板は開口側(参道中心)を向く垂直の帯。屋台中心からカウンター上・開口面へ少し出す。
    // ローカル: 開口は左屋台で +x、右屋台で -x。法線が参道中心を向くよう面の向きを側で変える。
    const facing = p.rotationY === Math.PI / 2 ? 1 : -1 // +x 向き(左屋台) / -x 向き(右屋台)
    const sx = p.x + facing * (DEPTH / 2 + SIGN_FORWARD) // 開口面より参道側へ出す(隠れ防止)
    const sy = SIGN_Y
    const sz = p.z

    // 板の横幅は z 方向(参道に沿う)に展開する。左右で表裏(法線)が逆になるよう頂点順を side で変える。
    // 4 頂点: 左下・右下・右上・左上(facing で z の符号順を入れ替えて表を参道中心へ)。
    const base = i * 4
    const zL = sz - hw * facing
    const zR = sz + hw * facing
    setVertex(positions, base + 0, sx, sy - hh, zL)
    setVertex(positions, base + 1, sx, sy - hh, zR)
    setVertex(positions, base + 2, sx, sy + hh, zR)
    setVertex(positions, base + 3, sx, sy + hh, zL)

    setUV(uvs, base + 0, u0, v0)
    setUV(uvs, base + 1, u1, v0)
    setUV(uvs, base + 2, u1, v1)
    setUV(uvs, base + 3, u0, v1)

    const io = i * 6
    indices[io + 0] = base + 0
    indices[io + 1] = base + 1
    indices[io + 2] = base + 2
    indices[io + 3] = base + 0
    indices[io + 4] = base + 2
    indices[io + 5] = base + 3
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return geometry
}

function setVertex(arr: Float32Array, vi: number, x: number, y: number, z: number): void {
  arr[vi * 3 + 0] = x
  arr[vi * 3 + 1] = y
  arr[vi * 3 + 2] = z
}

function setUV(arr: Float32Array, vi: number, u: number, v: number): void {
  arr[vi * 2 + 0] = u
  arr[vi * 2 + 1] = v
}

/**
 * 縁日屋台 約19軒を構築する(静的・非インタラクティブ)。
 * 屋根/柱/カウンター/紅白幕/裸電球/陳列品/暖簾(背板)を屋台横断の InstancedMesh で、
 * 屋号サインを 1 枚に結合した BufferGeometry(共有アトラス texture)で描く。
 */
export function createFestivalStalls(): WorldObject {
  const group = new Group()
  group.name = 'festival-stalls'

  const placements = computeFestivalStallPlacements()
  const n = placements.length

  // --- 共有マテリアル(構築時に一度だけ。色はすべて ART §2 内) ---
  // 木部(柱・カウンター)= 土色派生。夜に沈むシルエット(既存 stall.ts と同じ無発光)。
  const woodMaterial = new MeshLambertMaterial({ color: PALETTE.groundDirt })
  // 屋根・紅白幕は、屋台が PointLight の届かない遠方でも純黒に沈まず「暖色の灯りに照らされた
  // 縁日の屋根並み」として読めるよう、色相そのままに弱い emissive 床を足す(ART §4「光は emissive」)。
  // 強度は裸電球(1.6)・既存金魚すくい屋台(屋台 PointLight で最明 §7-4)より十分低く保ち、
  // 屋台前を最も明るくする関係(§7-4)を崩さない。
  const roofMaterial = new MeshStandardMaterial({
    color: PALETTE.stallCurtainRed, // 屋根 #c0392b
    emissive: new Color(PALETTE.stallCurtainRed),
    emissiveIntensity: 0.3,
    roughness: 1,
    metalness: 0,
  })
  const curtainRedMaterial = new MeshStandardMaterial({
    color: PALETTE.stallCurtainRed,
    emissive: new Color(PALETTE.stallCurtainRed),
    emissiveIntensity: 0.28,
    roughness: 1,
    metalness: 0,
  })
  const curtainWhiteMaterial = new MeshStandardMaterial({
    color: PALETTE.stallCurtainWhite,
    emissive: new Color(PALETTE.stallCurtainWhite),
    emissiveIntensity: 0.18,
    roughness: 1,
    metalness: 0,
  })
  const bulbMaterial = new MeshStandardMaterial({
    color: BULB_COLOR,
    emissive: new Color(BULB_COLOR),
    emissiveIntensity: 1.6, // 既存 stall と同じ。PointLight は足さず emissive で光らせる(§4)
    roughness: 0.4,
    metalness: 0,
  })
  // 暖簾(背板)・陳列品は per-instance の差し色を持つ(instanceColor)。夜でも種類ごとの色が読める
  // よう無発光(MeshBasicMaterial)で持たせ、差し色を暗めに乗せる(べた塗りの眩しさを避けつつ多彩さを出す)。
  const norenMaterial = new MeshBasicMaterial({ color: 0xffffff, fog: true })
  const itemMaterial = new MeshBasicMaterial({ color: 0xffffff, fog: true })

  // --- 共有ジオメトリ(low-poly) ---
  const postGeometry = new BoxGeometry(POST_THICK, POST_HEIGHT, POST_THICK)
  const roofGeometry = new BoxGeometry(FRONTAGE + ROOF_OVERHANG, ROOF_HEIGHT, DEPTH + ROOF_OVERHANG)
  const counterGeometry = new BoxGeometry(FRONTAGE, COUNTER_HEIGHT, COUNTER_DEPTH)
  const valanceWidth = (FRONTAGE + 0.2) / VALANCE_STRIPS
  const valanceGeometry = new BoxGeometry(valanceWidth, VALANCE_HEIGHT, 0.04)
  const bulbGeometry = new IcosahedronGeometry(0.08, 0) // 20 面の低ポリ電球
  const norenGeometry = new BoxGeometry(FRONTAGE, 0.7, 0.04) // 背の暖簾(差し色)
  // 陳列品の形ごとのジオメトリ(low-poly)。
  const itemSphereGeometry = new IcosahedronGeometry(0.07, 0)
  const itemBoxGeometry = new BoxGeometry(0.12, 0.1, 0.12)
  const itemStickGeometry = new CylinderGeometry(0.025, 0.025, 0.26, 6)

  // dispose 集約。
  const disposables: { dispose(): void }[] = [
    woodMaterial,
    roofMaterial,
    curtainRedMaterial,
    curtainWhiteMaterial,
    bulbMaterial,
    norenMaterial,
    itemMaterial,
    postGeometry,
    roofGeometry,
    counterGeometry,
    valanceGeometry,
    bulbGeometry,
    norenGeometry,
    itemSphereGeometry,
    itemBoxGeometry,
    itemStickGeometry,
  ]

  // --- InstancedMesh 群(屋台横断でインスタンス化) ---
  const POSTS_PER_STALL = 4
  const posts = new InstancedMesh(postGeometry, woodMaterial, n * POSTS_PER_STALL)
  const roofs = new InstancedMesh(roofGeometry, roofMaterial, n)
  const counters = new InstancedMesh(counterGeometry, woodMaterial, n)
  const redStrips = Math.ceil(VALANCE_STRIPS / 2) * n
  const whiteStrips = Math.floor(VALANCE_STRIPS / 2) * n
  const valanceRed = new InstancedMesh(valanceGeometry, curtainRedMaterial, redStrips)
  const valanceWhite = new InstancedMesh(valanceGeometry, curtainWhiteMaterial, whiteStrips)
  const bulbs = new InstancedMesh(bulbGeometry, bulbMaterial, n * BULBS_PER_STALL)
  const norens = new InstancedMesh(norenGeometry, norenMaterial, n)
  // 陳列品は形ごとに 1 つの InstancedMesh。全屋台ぶんを確保(使わない分はスケール0で隠す)。
  const itemSpheres = new InstancedMesh(itemSphereGeometry, itemMaterial, n * ITEMS_PER_STALL)
  const itemBoxes = new InstancedMesh(itemBoxGeometry, itemMaterial, n * ITEMS_PER_STALL)
  const itemSticks = new InstancedMesh(itemStickGeometry, itemMaterial, n * ITEMS_PER_STALL)

  const instanced: InstancedMesh[] = [
    posts,
    roofs,
    counters,
    valanceRed,
    valanceWhite,
    bulbs,
    norens,
    itemSpheres,
    itemBoxes,
    itemSticks,
  ]
  posts.name = 'festival-posts'
  roofs.name = 'festival-roofs'

  // per-instance 変換用ワーク(フレーム毎の new なし。構築時のみ使用)。
  const dummy = new Object3D()
  const color = new Color()
  const hiddenMatrix = new Matrix4().makeScale(0, 0, 0) // 未使用インスタンスを潰す

  // 書き込みカーソル。
  let postCursor = 0
  let redCursor = 0
  let whiteCursor = 0
  let bulbCursor = 0
  let sphereCursor = 0
  let boxCursor = 0
  let stickCursor = 0

  const halfW = FRONTAGE / 2
  const halfD = DEPTH / 2

  // 無発光(Basic)の暖簾は accent をそのまま出すと夜に眩しいので暗めに乗せる(色相は据え置き)。
  const NOREN_SHADE = 0.55
  const ITEM_BASE_SHADE = 0.7

  for (let i = 0; i < n; i++) {
    const p = placements[i]
    const kind = STALL_KINDS[p.kind]
    const cx = p.x
    const cz = p.z
    // 開口が参道中心を向く向き(左屋台 = +x 側が開口 / 右屋台 = -x 側が開口)。
    const facing = p.rotationY === Math.PI / 2 ? 1 : -1
    // 開口面の x(参道中心側)。
    const openX = cx + facing * halfD

    // 柱 4 本(間口の四隅)。間口は z 方向に展開、奥行は x 方向。
    for (const dz of [-1, 1] as const) {
      for (const dxi of [-1, 1] as const) {
        dummy.position.set(cx + dxi * halfD, POST_HEIGHT / 2, cz + dz * halfW)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        posts.setMatrixAt(postCursor++, dummy.matrix)
      }
    }

    // 屋根(間口=z方向 + 張り出し)。box の x が奥行、z が間口になるよう寸法を合わせてある。
    dummy.position.set(cx, POST_HEIGHT + ROOF_HEIGHT / 2, cz)
    dummy.rotation.set(0, Math.PI / 2, 0) // box の長辺(FRONTAGE)を z(間口)へ向ける
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    roofs.setMatrixAt(i, dummy.matrix)

    // カウンター(開口側の台)。間口(z方向)に伸ばす。
    dummy.position.set(openX - facing * (COUNTER_DEPTH / 2), COUNTER_HEIGHT / 2, cz)
    dummy.rotation.set(0, Math.PI / 2, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    counters.setMatrixAt(i, dummy.matrix)

    // 紅白幕(屋根下・開口側に吊る短冊。赤白交互)。間口(z方向)に並べる。
    const valanceX = openX + facing * 0.02
    const valanceY = POST_HEIGHT - 0.05
    for (let s = 0; s < VALANCE_STRIPS; s++) {
      const zPos = cz - (FRONTAGE + 0.2) / 2 + valanceWidth * (s + 0.5)
      dummy.position.set(valanceX, valanceY, zPos)
      dummy.rotation.set(0, Math.PI / 2, 0) // 板面を開口(x)へ向ける
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      if (s % 2 === 0) valanceRed.setMatrixAt(redCursor++, dummy.matrix)
      else valanceWhite.setMatrixAt(whiteCursor++, dummy.matrix)
    }

    // 裸電球 2 個(emissive。屋根下の開口寄り。PointLight は足さない)。
    for (let b = 0; b < BULBS_PER_STALL; b++) {
      const zPos = cz + (b === 0 ? -halfW * 0.5 : halfW * 0.5)
      dummy.position.set(openX - facing * 0.1, POST_HEIGHT - 0.25, zPos)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      bulbs.setMatrixAt(bulbCursor++, dummy.matrix)
    }

    // 暖簾(背板。差し色)。奥側(開口の反対)に立て、屋台の色を一目で変える。
    dummy.position.set(cx - facing * halfD + facing * 0.02, COUNTER_HEIGHT + 0.45, cz)
    dummy.rotation.set(0, Math.PI / 2, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    norens.setMatrixAt(i, dummy.matrix)
    norens.setColorAt(i, color.set(kind.accent).multiplyScalar(NOREN_SHADE))

    // 陳列品(色とりどりの単純形状)。カウンター上に小さく並べる。形は種類ごと。
    for (let k = 0; k < ITEMS_PER_STALL; k++) {
      // カウンター上(開口寄り)に z 方向へ散らす。差し色は accent をわずかに明暗ゆらす。
      const t = ITEMS_PER_STALL > 1 ? k / (ITEMS_PER_STALL - 1) : 0.5
      const zPos = cz - halfW * 0.7 + t * (FRONTAGE * 0.7)
      const itemX = openX - facing * (COUNTER_DEPTH * 0.45)
      const yJit = jitterRange(i * ITEMS_PER_STALL + k, 0, 0.04, 31)
      dummy.position.set(itemX, COUNTER_HEIGHT + 0.09 + yJit, zPos)
      dummy.rotation.set(0, jitterRange(i * ITEMS_PER_STALL + k, 0, Math.PI, 32), 0)
      dummy.scale.set(1, 1, 1)
      // stick(りんご飴/とうもろこし等)は縦に立てる。
      if (kind.item === 'stick') {
        dummy.position.y = COUNTER_HEIGHT + 0.13
      }
      dummy.updateMatrix()
      // 差し色を明度ゆらぎで彩る(同一色のべた塗りを避ける。色相は据え置き=新色なし)。
      const shade = ITEM_BASE_SHADE * (0.9 + jitter01(i * ITEMS_PER_STALL + k, 33) * 0.2)
      color.set(kind.accent).multiplyScalar(shade)
      if (kind.item === 'sphere') {
        itemSpheres.setMatrixAt(sphereCursor, dummy.matrix)
        itemSpheres.setColorAt(sphereCursor, color)
        sphereCursor++
      } else if (kind.item === 'box') {
        itemBoxes.setMatrixAt(boxCursor, dummy.matrix)
        itemBoxes.setColorAt(boxCursor, color)
        boxCursor++
      } else {
        itemSticks.setMatrixAt(stickCursor, dummy.matrix)
        itemSticks.setColorAt(stickCursor, color)
        stickCursor++
      }
    }
  }

  // 未使用の陳列品インスタンス(形ごとに確保数が異なる)はスケール0で隠し、色も初期化する。
  const black = new Color(0x000000)
  fillHidden(itemSpheres, sphereCursor, hiddenMatrix, black)
  fillHidden(itemBoxes, boxCursor, hiddenMatrix, black)
  fillHidden(itemSticks, stickCursor, hiddenMatrix, black)

  for (const im of instanced) {
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    group.add(im)
  }

  // --- 屋号サイン(全屋台ぶんを 1 枚に結合 / 共有アトラス。draw call 1) ---
  const signTexture = createSignAtlas()
  const signMaterial = new MeshBasicMaterial({
    map: signTexture,
    transparent: true,
    side: DoubleSide, // 巻き順に依らず参道側から屋号が読めるよう両面表示
    fog: true, // 遠方の屋号は夜のフォグへ自然に溶ける
  })
  const signGeometry = buildSignsGeometry(placements)
  const signMesh = new Mesh(signGeometry, signMaterial)
  signMesh.name = 'festival-signs'
  group.add(signMesh)
  disposables.push(signTexture, signMaterial, signGeometry)

  return {
    object: group,
    dispose(): void {
      for (const im of instanced) im.dispose()
      for (const d of disposables) d.dispose()
    },
  }
}

/** InstancedMesh の cursor 以降を非表示(スケール0)で埋め、色も既定値にする。 */
function fillHidden(
  mesh: InstancedMesh,
  fromIndex: number,
  hiddenMatrix: Matrix4,
  defaultColor: Color,
): void {
  for (let i = fromIndex; i < mesh.count; i++) {
    mesh.setMatrixAt(i, hiddenMatrix)
    mesh.setColorAt(i, defaultColor)
  }
}
