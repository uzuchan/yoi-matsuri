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
