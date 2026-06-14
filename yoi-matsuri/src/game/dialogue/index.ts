/**
 * 会話ドメイン(T-004 段B)。three / react / DOM 非依存の純TS。
 * 具象 DialogueController(店主会話)と会話データを公開する。合成点(App.tsx / main.tsx)が
 * createGoldfishStallDialogue() で生成して注入する。
 */
export {
  GoldfishStallDialogue,
  createGoldfishStallDialogue,
  TYPING_CHARS_PER_SEC,
} from './GoldfishStallDialogue'
export {
  GOLDFISH_STALL_SCRIPT,
  SHOPKEEPER,
  CHOICE_PLAY,
  CHOICE_LATER,
} from './script'
export type { DialogueScript, DialogueLine, DialogueChoiceDef } from './script'

// StallFramework §2.5: 固有会話を持たない屋台のための汎用フォールバック会話。
export {
  createGenericStallDialogue,
  createGenericStallScript,
} from './genericStall'

// P2 量産屋台(スーパーボールすくい / お面屋)の店主会話(状態機械は金魚と共通・スクリプト差し替え)。
export {
  createSuperballStallDialogue,
  createMaskStallDialogue,
  SUPERBALL_STALL_SCRIPT,
  MASK_STALL_SCRIPT,
} from './stallScripts'
