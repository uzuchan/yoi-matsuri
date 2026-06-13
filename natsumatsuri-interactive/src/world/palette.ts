/**
 * ART_DIRECTION §2 カラーパレット(唯一の正)と、参道のレイアウト定数。
 * world/ 配下のビルダーはすべてこの定数を参照し、パレット外の色を持ち込まない。
 */

/** ART §2 パレット。キーは用途、値はARTのカラーコード。 */
export const PALETTE = {
  /** 夜空(上端) #0a0e2e 濃紺 */
  skyTop: '#0a0e2e',
  /** 夜空(地平線) #1a2348 グラデーション下端 */
  skyHorizon: '#1a2348',
  /** フォグ #141a38 */
  fog: 0x141a38,
  /** 提灯の紙(発光) #ff9d45 */
  lanternPaper: '#ff9d45',
  /** 提灯の赤帯 #c0392b 上下の枠 */
  lanternBand: '#c0392b',
  /** 参道の土 #3a3148(純黒禁止) */
  groundDirt: '#3a3148',
  /** 鳥居 #b03a2e 朱 */
  torii: '#b03a2e',
  /** 屋台の幕(赤) #c0392b */
  stallCurtainRed: '#c0392b',
  /** 屋台の幕(白) #f5f0e8 */
  stallCurtainWhite: '#f5f0e8',
  /** 水面(金魚すくい) #1e4d6b 半透明 opacity 0.85 */
  water: '#1e4d6b',
  /** 群衆シルエット #0d1126 無発光 */
  crowd: '#0d1126',
  /** プレイヤー胴・頭 #1b2240 寒色。群衆上限フォグ #141a38 より一段明るい固定床値(ART §2 視認性) */
  playerBody: '#1b2240',
} as const

/** ART §4 屋台の裸電球の色 #ffd166(屋台光のPointLightと共通)。 */
export const BULB_COLOR = '#ffd166'

/**
 * 参道レイアウト(GAME_DESIGN_DOCUMENT §2)。単位はメートル。
 * 参道は +Z(手前)から -Z(奥=鳥居)へ伸びる。x=0 が中心線。
 */
export const APPROACH = {
  /** 参道の幅 8m。 */
  width: 8,
  /** 参道の奥行き 60m。 */
  depth: 60,
  /** 提灯の間隔 2.5m。 */
  lanternSpacing: 2.5,
  /** 片側の提灯数 24個。 */
  lanternsPerSide: 24,
  /** 提灯を吊るワイヤーの高さ 2.6m。 */
  lanternWireHeight: 2.6,
  /** 鳥居のz座標(参道終端付近)。 */
  toriiZ: -60,
  /** 鳥居の高さ 8m。 */
  toriiHeight: 8,
} as const

/**
 * 提灯列のx座標(中心線から左右へ。ワイヤーは参道幅の少し内側に張る)。
 * 参道幅8mに対し、提灯は端から0.5m内側(x=±3.5)。
 */
export const LANTERN_X = APPROACH.width / 2 - 0.5

/**
 * index番目の提灯のz座標を返す(両側で共通)。
 * 手前 z=+2.5 付近から 2.5m 間隔で奥へ並べる。決定論的(テスト可能)。
 */
export function lanternZ(index: number): number {
  // 手前側に1個ぶんの余白を取り、そこから奥(負方向)へ等間隔で配置する。
  return -index * APPROACH.lanternSpacing
}

/**
 * indexベースの決定論的な擬似乱数(0..1)。
 * core/rng に依存せず world 内で完結させる(再現可能・テスト可能)。
 * 整数indexと任意のseedから、繰り返しの少ない値を生成する。
 */
export function jitter01(index: number, seed = 0): number {
  // 三角関数ハッシュ。indexが連番でも出力が散らばるよう大きな係数を使う。
  const x = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** jitter01 を [min, max) の範囲へ写像する。 */
export function jitterRange(index: number, min: number, max: number, seed = 0): number {
  return min + jitter01(index, seed) * (max - min)
}
