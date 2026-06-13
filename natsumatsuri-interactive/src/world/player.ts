import {
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import { PALETTE } from './palette'
import type { WorldObject } from './types'

/**
 * プレイヤーの最小限の可視表現。
 *
 * ART_DIRECTION にプレイヤー造形の規定が無いため(T-003 AC1: art-director 所見を仰ぐ対象)、
 * 最小・パレット整合で実装する。胴+頭の単純な人型シルエットを寒色ベースで作り、
 * 群衆(#0d1126)と同系の夜の色に寄せつつ、暗い前景地面に完全に埋もれないよう
 * 胴に小さな暖色アクセント(提灯の紙色 #ff9d45 の帯=祭りの法被/手ぬぐいを示唆)を加える。
 * 新規の色相は持ち込まない(すべて ART §2 パレット内)。
 *
 * 原点はプレイヤーの足元(y=0=地面)。ApproachScene が position を毎フレーム更新する。
 * 歩行アニメ(ボブ・腕振り)は T-009 のスコープ外。ここでは静的造形のみ。
 */

// 群衆色を基準にしつつ、地面から最小限分離するため明度をわずかに持ち上げた寒色。
// 色相は据え置き(フォグ色 #141a38 を上限とする群衆と同じ考え方)。
const BODY_COLOR = new Color(PALETTE.crowd).lerp(new Color(PALETTE.fog), 0.6)

// 体格(人型・身長 ~1.7m)。
const TOTAL_HEIGHT = 1.7
const TORSO_RADIUS = 0.22
const HEAD_RADIUS = 0.17
// 胴(カプセル)の円柱部高さ。頭ぶんを残して足元から立ち上げる。
const TORSO_CYLINDER = 1.0

export function createPlayer(): WorldObject {
  const group = new Group()
  group.name = 'player'

  // 胴: 寒色のカプセル。ライティングを受けて屋台前で明るくなる。
  const bodyMaterial = new MeshLambertMaterial({ color: BODY_COLOR })
  const torsoGeometry = new CapsuleGeometry(TORSO_RADIUS, TORSO_CYLINDER, 4, 10)
  const torso = new Mesh(torsoGeometry, bodyMaterial)
  // カプセルの中心 = 円柱中心 + 端の半球。足元(y=0)から立てる。
  const torsoCenterY = TORSO_RADIUS + TORSO_CYLINDER / 2
  torso.position.y = torsoCenterY
  group.add(torso)

  // 頭: 同じ寒色の球。
  const headGeometry = new SphereGeometry(HEAD_RADIUS, 12, 10)
  const head = new Mesh(headGeometry, bodyMaterial)
  head.position.y = TOTAL_HEIGHT - HEAD_RADIUS
  group.add(head)

  // 暖色アクセント帯(法被/手ぬぐいを示唆)。胴の上部に細い帯を巻く。
  // emissive を弱く乗せ、夜の前景でも「プレイヤーがそこにいる」と読めるようにする。
  const accentMaterial = new MeshStandardMaterial({
    color: PALETTE.lanternPaper,
    emissive: new Color(PALETTE.lanternPaper),
    emissiveIntensity: 0.35,
    roughness: 0.8,
    metalness: 0,
  })
  // 胴よりわずかに太いカプセルの帯(短い円柱でも良いが、胴形状に沿わせるためカプセル流用)。
  const accentGeometry = new CapsuleGeometry(TORSO_RADIUS + 0.015, 0.12, 3, 10)
  const accent = new Mesh(accentGeometry, accentMaterial)
  accent.position.y = torsoCenterY + 0.18
  group.add(accent)

  return {
    object: group,
    dispose(): void {
      torsoGeometry.dispose()
      headGeometry.dispose()
      accentGeometry.dispose()
      bodyMaterial.dispose()
      accentMaterial.dispose()
    },
  }
}
