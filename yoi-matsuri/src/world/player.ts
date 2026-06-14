import {
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import { PALETTE } from './palette'
import type { WorldObject } from './types'

/**
 * プレイヤーの最小限の可視表現。
 *
 * 胴+頭の単純な人型シルエットを寒色ベースで作り、暗い前景地面・群衆へ埋もれないよう
 * ART §2「プレイヤーの視認性」に従う。胴・頭は寒色の固定床値 #1b2240(群衆の上限フォグ
 * #141a38 より一段明るい)を照明の有無に関わらず保証し、純黒へ沈ませない。
 * さらに胴上部に細い暖色アクセント帯(提灯の紙色 #ff9d45 の帯=祭りの法被/手ぬぐいを
 * 示唆)を 1 本だけ加える(増やさない: §7-4 屋台前の視線誘導と競合させないため)。
 * 新規の色相は持ち込まない(すべて ART §2 パレット内)。
 *
 * 原点はプレイヤーの足元(y=0=地面)。ApproachScene が position を毎フレーム更新する。
 * 歩行アニメ(ボブ・腕振り)は T-009 のスコープ外。ここでは静的造形のみ。
 */

// ART §2/§3: プレイヤー胴・頭の寒色固定床値 #1b2240。
const BODY_COLOR = new Color(PALETTE.playerBody)

// 体格(人型・身長 ~1.7m)。
const TOTAL_HEIGHT = 1.7
const TORSO_RADIUS = 0.22
const HEAD_RADIUS = 0.17
// 胴(カプセル)の円柱部高さ。頭ぶんを残して足元から立ち上げる。
const TORSO_CYLINDER = 1.0

export function createPlayer(): WorldObject {
  const group = new Group()
  group.name = 'player'

  // 胴・頭: 寒色のカプセル/球。
  // ART §2: emissive #1b2240 / emissiveIntensity 1.0 を base に重ね、影域でも床値 #1b2240 を
  // 必ず確保する(純黒へ沈ませない)。照明域(屋台前など)では base 色に加色されさらに明るくなる。
  const bodyMaterial = new MeshStandardMaterial({
    color: BODY_COLOR,
    emissive: BODY_COLOR,
    emissiveIntensity: 1.0,
    roughness: 0.85,
    metalness: 0,
  })
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
