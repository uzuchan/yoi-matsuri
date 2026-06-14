/**
 * お面屋(CHOICE 原型 / 屋台#19)のデータ。three / react / DOM 非依存の純データ(D-003)。
 *
 * 選択式(物理なし)。複数のお面から選び、選んだお面が報酬(コレクション)になる
 * (MINIGAME_ARCHETYPES §2 #19 / §1 CHOICE)。結果は基本「選べた=成功」、希少なお面=大成功
 * (§1 CHOICE「上等 or 新規コレクション=大成功」)。失敗概念なし(選べば必ず成功以上)。
 *
 * お面の見た目(顔の形・色)はパレット内(ART §2)で表現する。各お面は決定論的なテーマを持つ。
 */

/** お面 1 種の定義(見た目・希少度)。three / react 非依存。 */
export interface MaskKind {
  /** お面ID(コレクションキー・報酬ID の元)。 */
  readonly id: string
  /** 表示名(結果見出し・店主セリフ・図鑑)。 */
  readonly displayName: string
  /** 報酬アイコン代わりの絵文字(外部画像禁止のため文字で表す)。 */
  readonly icon: string
  /** 顔の地色(ART §2 パレット内)。 */
  readonly faceColor: string
  /** 模様/差し色(目・口・額。ART §2 パレット内)。 */
  readonly accentColor: string
  /** 希少枠か(true=大成功・レア。§1 CHOICE: 新規/上等=大成功)。 */
  readonly rare: boolean
}

/**
 * 並べるお面(キツネ/ひょっとこ/おかめ/般若/アニメ風 等。§タスク要件 4〜6種)。
 * 色はすべて ART §2 + 花火3色の既存パレット内(新色は持ち込まない)。希少枠は般若1種(レア=大成功)。
 */
export const MASK_KINDS: readonly MaskKind[] = [
  // キツネ(白地・朱の隈取り)
  { id: 'mask:kitsune', displayName: 'キツネのお面', icon: '🦊', faceColor: '#f5f0e8', accentColor: '#c0392b', rare: false },
  // ひょっとこ(暖色肌・赤い口)
  { id: 'mask:hyottoko', displayName: 'ひょっとこのお面', icon: '😗', faceColor: '#ff9d45', accentColor: '#c0392b', rare: false },
  // おかめ(白地・桃の頬)
  { id: 'mask:okame', displayName: 'おかめのお面', icon: '😊', faceColor: '#f5f0e8', accentColor: '#ff6b9d', rare: false },
  // アニメ風(黄地・青緑の模様。現代の縁日らしさ)
  { id: 'mask:anime', displayName: 'アニメ風のお面', icon: '🎭', faceColor: '#ffd166', accentColor: '#4ecdc4', rare: false },
  // 般若(朱地・暗い角。希少=大成功)
  { id: 'mask:hannya', displayName: '般若のお面', icon: '👹', faceColor: '#b03a2e', accentColor: '#1a1a22', rare: true },
] as const

/** お面の総数。 */
export const MASK_COUNT = MASK_KINDS.length
