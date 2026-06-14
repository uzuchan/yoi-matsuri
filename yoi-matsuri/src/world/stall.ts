import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { BULB_COLOR, PALETTE } from './palette'
import type { WorldObject } from './types'

// ART §3 / GDD §2 金魚すくい屋台: 間口3m × 奥行2m。参道中腹の右側。
const FRONTAGE = 3 // 間口(x方向)
const DEPTH = 2 // 奥行(z方向)
const COUNTER_HEIGHT = 0.9
const POST_HEIGHT = 2.4 // 柱の高さ(屋根まで)
const ROOF_HEIGHT = 0.5

/**
 * 屋台の配置(GDD §2「中腹の右側」)。
 * 参道は z=+(手前)→ z=-60(奥)。中腹 ≈ z=-26、右側 = +x。
 * 屋台本体は参道端の少し外(x=+5)に置き、開口(カウンター)が中心線(-x方向)を向く。
 * T-003 の近接判定はこの座標を基準にする想定(stall:approach / interactRadius=3m)。
 */
export const STALL_POSITION = { x: 5, z: -26 } as const

/**
 * 屋台の識別子(GameEvents の stall:approach / stall:leave のペイロード stallId)。
 * Vertical Slice では金魚すくい屋台 1 軒のみ。複数屋台はスコープ外(BACKLOG Icebox)。
 */
export const STALL_ID = 'goldfish-stall' as const

/** 屋台の店主シルエットの立ち位置(屋台内側)。 */
export const STALL_BULB_HEIGHT = POST_HEIGHT - 0.3

/**
 * 屋台(金魚すくい)の外観を構築する。遊技機能は持たない(T-006が中身を実装)。
 * 紅白幕・カウンター・屋根・裸電球2個(発光)・水槽(楕円・半透明水面)・店主シルエット+前掛け。
 *
 * ローカル原点を屋台中心とし、group全体を STALL_POSITION へ移動・回転する。
 * 開口は -x(参道中心)を向く。
 */
export function createStall(): WorldObject {
  const group = new Group()
  group.name = 'stall'
  group.position.set(STALL_POSITION.x, 0, STALL_POSITION.z)
  // 開口を参道中心(-x方向)へ向ける。
  group.rotation.y = -Math.PI / 2

  // 共有マテリアル群(構築時に一度だけ生成)。色はすべて ART §2 パレット内に収める。
  // 木部(柱・カウンター)は参道の土 #3a3148 を流用(夜に沈んだ木部=同系の暗色)。
  const woodMaterial = new MeshLambertMaterial({ color: PALETTE.groundDirt })
  const curtainRedMaterial = new MeshLambertMaterial({ color: PALETTE.stallCurtainRed })
  const curtainWhiteMaterial = new MeshLambertMaterial({ color: PALETTE.stallCurtainWhite })
  const roofMaterial = new MeshLambertMaterial({ color: PALETTE.stallCurtainRed })
  const bulbMaterial = new MeshStandardMaterial({
    color: BULB_COLOR,
    emissive: new Color(BULB_COLOR),
    emissiveIntensity: 1.6,
    roughness: 0.4,
    metalness: 0,
  })
  const waterMaterial = new MeshStandardMaterial({
    color: PALETTE.water,
    emissive: new Color(PALETTE.water),
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
    metalness: 0,
  })
  // 水槽の鉢は土 #3a3148 を暗くした同系色(パレット内の派生)。
  const tankMaterial = new MeshLambertMaterial({
    color: new Color(PALETTE.groundDirt).multiplyScalar(0.7),
  })
  // 店主シルエットは群衆と同じ無発光シルエット色 #0d1126。
  const keeperMaterial = new MeshBasicMaterial({ color: PALETTE.crowd })
  const apronMaterial = new MeshLambertMaterial({ color: PALETTE.stallCurtainWhite }) // 前掛け

  // dispose対象を集約。
  const geometries: { dispose(): void }[] = []
  const track = <T extends { dispose(): void }>(g: T): T => {
    geometries.push(g)
    return g
  }

  // --- 柱(四隅) ---
  const postGeometry = track(new BoxGeometry(0.12, POST_HEIGHT, 0.12))
  const halfW = FRONTAGE / 2
  const halfD = DEPTH / 2
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const post = new Mesh(postGeometry, woodMaterial)
      post.position.set(sx * halfW, POST_HEIGHT / 2, sz * halfD)
      group.add(post)
    }
  }

  // --- 屋根(切妻風の浅い箱) ---
  const roofGeometry = track(new BoxGeometry(FRONTAGE + 0.6, ROOF_HEIGHT, DEPTH + 0.6))
  const roof = new Mesh(roofGeometry, roofMaterial)
  roof.position.set(0, POST_HEIGHT + ROOF_HEIGHT / 2, 0)
  group.add(roof)

  // --- 紅白幕(屋根の正面下に吊る帯。赤白交互の短冊) ---
  const valanceWidth = (FRONTAGE + 0.4) / 6
  const valanceGeometry = track(new BoxGeometry(valanceWidth, 0.5, 0.04))
  const valanceY = POST_HEIGHT - 0.25
  const valanceZ = -halfD - 0.3 // 正面(開口側 = ローカル -z 側)
  for (let i = 0; i < 6; i++) {
    const strip = new Mesh(valanceGeometry, i % 2 === 0 ? curtainRedMaterial : curtainWhiteMaterial)
    strip.position.set(-(FRONTAGE + 0.4) / 2 + valanceWidth * (i + 0.5), valanceY, valanceZ)
    group.add(strip)
  }

  // --- カウンター(開口側の台) ---
  const counterGeometry = track(new BoxGeometry(FRONTAGE, COUNTER_HEIGHT, 0.5))
  const counter = new Mesh(counterGeometry, woodMaterial)
  counter.position.set(0, COUNTER_HEIGHT / 2, valanceZ + 0.1)
  group.add(counter)

  // --- 裸電球2個(#ffd166 発光)。屋根下の左右に吊る ---
  const bulbGeometry = track(new SphereGeometry(0.09, 10, 8))
  const bulbLocalPositions = [
    new Vector3(-halfW * 0.6, STALL_BULB_HEIGHT, 0),
    new Vector3(halfW * 0.6, STALL_BULB_HEIGHT, 0),
  ]
  for (const p of bulbLocalPositions) {
    const bulb = new Mesh(bulbGeometry, bulbMaterial)
    bulb.position.copy(p)
    group.add(bulb)
  }

  // --- 水槽(楕円。半透明の水面 #1e4d6b opacity0.85)。カウンター上 ---
  const tankGeometry = track(new CylinderGeometry(0.55, 0.55, 0.35, 16))
  tankGeometry.scale(1, 1, 0.7) // 楕円形に潰す
  const tank = new Mesh(tankGeometry, tankMaterial)
  tank.position.set(0, COUNTER_HEIGHT + 0.175, valanceZ + 0.1)
  group.add(tank)

  const waterGeometry = track(new CylinderGeometry(0.5, 0.5, 0.04, 16))
  waterGeometry.scale(1, 1, 0.7)
  const water = new Mesh(waterGeometry, waterMaterial)
  water.position.set(0, COUNTER_HEIGHT + 0.33, valanceZ + 0.1)
  group.add(water)

  // --- 店主シルエット(単純化人型)+前掛け。カウンター奥に立つ ---
  const keeper = createKeeper(track, keeperMaterial, apronMaterial)
  keeper.position.set(0.3, 0, halfD - 0.5)
  group.add(keeper)

  return {
    object: group,
    dispose(): void {
      for (const g of geometries) g.dispose()
      woodMaterial.dispose()
      curtainRedMaterial.dispose()
      curtainWhiteMaterial.dispose()
      roofMaterial.dispose()
      bulbMaterial.dispose()
      waterMaterial.dispose()
      tankMaterial.dispose()
      keeperMaterial.dispose()
      apronMaterial.dispose()
    },
  }
}

/** 店主の単純化人型シルエット(胴+頭+前掛け)。 */
function createKeeper(
  track: <T extends { dispose(): void }>(g: T) => T,
  bodyMaterial: MeshBasicMaterial,
  apronMaterial: MeshLambertMaterial,
): Group {
  const keeper = new Group()
  keeper.name = 'stall-keeper'

  const torsoGeometry = track(new CylinderGeometry(0.22, 0.28, 0.9, 8))
  const torso = new Mesh(torsoGeometry, bodyMaterial)
  torso.position.y = 1.05
  keeper.add(torso)

  const headGeometry = track(new SphereGeometry(0.16, 10, 8))
  const head = new Mesh(headGeometry, bodyMaterial)
  head.position.y = 1.66
  keeper.add(head)

  // 前掛け(胴の正面に薄板)。
  const apronGeometry = track(new BoxGeometry(0.4, 0.5, 0.04))
  const apron = new Mesh(apronGeometry, apronMaterial)
  apron.position.set(0, 0.85, -0.26)
  keeper.add(apron)

  return keeper
}
