/**
 * スーパーボールすくいの物理・ルールパラメータ(MINIGAME_ARCHETYPES 原型A SCOOP / 屋台#1)。
 *
 * three / react / DOM 非依存の純データ(D-003)。**ポイ物理は金魚すくいの Poi クラス
 * (game/goldfish/poi.ts)をそのまま再利用**するため、ポイ系のパラメータは GoldfishParams 型を
 * 共有する(金魚は無改修。poi.ts はモジュールとして再利用する / タスク要件)。
 *
 * 金魚すくいとの差別化(MINIGAME_ARCHETYPES §2 #1):
 *  - 対象は「ゆらゆら漂って弾むスーパーボール」(逃げない=単純な bob/drift)。
 *  - 「確保が軽い代わり数を要求」: liftSpeedMax をやや緩め、対象数を増やし tier 境界を上げる。
 *  - 紙耐久・水中ダメージ・speed² の手触り(そっとすくう)は金魚すくいと同型(SCOOP 原型の核)。
 *
 * 値は屋台パラメータとしてここで一元管理する(コード各所にハードコードしない / 金魚 params.ts の規律)。
 */
import { DEFAULT_TANK_BOUNDS, type GoldfishParams, type TankBounds } from '../goldfish'

/**
 * スーパーボールすくいのポイ物理パラメータ(GoldfishParams を共有)。
 *
 * ポイ系(追従・耐久・速度ダメージ・持ち上げ速度)は金魚と同じ物理モデルを使う。値だけ屋台向けに
 * 調整する。fishCount / fishEscapeRadius / fishCruiseSpeed / fishFleeSpeed は Poi クラスでは未使用
 * (Poi は paper 物理のみ)。ボール側パラメータは SUPERBALL_PARAMS に分離する。
 */
export const SUPERBALL_POI_PARAMS: GoldfishParams = {
  // 追従・水抵抗は金魚と同一(同じ "そっと" の手触り)。
  poiFollowLag: 0.12,
  waterDragFactor: 3.5,
  // 紙耐久は金魚と同一(SCOOP 原型: 紙が破れる罰を共有)。
  paperDurability: 100,
  wetDamagePerSec: 4.0,
  speedDamageCoeff: 220,
  // ボールは軽い(金魚の荷重 12pt より軽い 8pt)。数をすくいやすくする差別化。
  fishWeightDamage: 8,
  // 確保がやや軽い(0.35→0.42)。「数を要求」する代わりに 1 個あたりの確保はしやすい(§2 #1)。
  liftSpeedMax: 0.42,
  // 以下は Poi では未使用(対象 AI は Ball が持つ)。互換のため GoldfishParams を満たす値を置く。
  fishEscapeRadius: 0,
  fishCruiseSpeed: 0,
  fishFleeSpeed: 0,
  sessionTimeLimit: 60,
  fishCount: 10,
  poiRadius: 0.1, // 金魚 0.09 よりわずかに大きい(複数同時すくいを許容)
  dipDepth: 0.04,
}

/** ボール固有(漂い/弾み)のパラメータ。three / react 非依存。 */
export interface SuperballParams {
  /** 制限時間 [s]。 */
  readonly sessionTimeLimit: number
  /** 水槽に浮かぶボール数 [個]。 */
  readonly ballCount: number
  /** ポイ円の半径 [m](捕獲判定。SUPERBALL_POI_PARAMS.poiRadius と一致させる)。 */
  readonly poiRadius: number
  /** 持ち上げ速度の上限 [m/s](これ以下で確保。SUPERBALL_POI_PARAMS.liftSpeedMax と一致)。 */
  readonly liftSpeedMax: number
  /** ボールの漂い速度 [m/s](水面をゆっくり流れる)。 */
  readonly driftSpeed: number
  /** ボールが向きを変える平均間隔 [s](drift の方向転換)。 */
  readonly driftTurnInterval: number
  /** 上下の弾み(bob)振幅 [m](描画 y のゆらぎ。捕獲には影響しない見た目要素)。 */
  readonly bobAmplitude: number
  /** bob の角速度 [rad/s]。 */
  readonly bobSpeed: number
}

/** スーパーボールすくいの既定ボールパラメータ。 */
export const DEFAULT_SUPERBALL_PARAMS: SuperballParams = {
  sessionTimeLimit: SUPERBALL_POI_PARAMS.sessionTimeLimit,
  ballCount: SUPERBALL_POI_PARAMS.fishCount,
  poiRadius: SUPERBALL_POI_PARAMS.poiRadius,
  liftSpeedMax: SUPERBALL_POI_PARAMS.liftSpeedMax,
  driftSpeed: 0.06, // 金魚 cruise 0.1 よりゆっくり(ゆらゆら漂う)
  driftTurnInterval: 2.2,
  bobAmplitude: 0.01,
  bobSpeed: 2.4,
}

/** スーパーボール水槽の寸法(金魚と同じ楕円鉢を流用)。 */
export const SUPERBALL_TANK_BOUNDS: TankBounds = DEFAULT_TANK_BOUNDS

/** 耐久警告のしきい値 [pt](金魚と同じ。残30以下で初回警告 = 破損予兆 §0-4)。 */
export const SUPERBALL_PAPER_WARNING_THRESHOLD = 30

/**
 * ボールの色(色とりどり / §2 #1「色とりどり」)。ART §2 + 花火3色のパレット内で多彩に見せる
 * (新色は持ち込まない: 金魚赤・提灯紙・花火3色・水面・幕白)。決定論的に index で割り当てる。
 */
export const SUPERBALL_COLORS: readonly string[] = [
  '#e84a30', // 金魚赤
  '#ff9d45', // 提灯の紙(暖色)
  '#ffd166', // 花火 黄
  '#ff6b9d', // 花火 桃
  '#4ecdc4', // 花火 青緑
]
