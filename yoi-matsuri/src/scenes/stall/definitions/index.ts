import { StallRegistry } from '../registry'
import { goldfishStallDefinition } from './goldfish'
import { superballStallDefinition } from './superball'
import { maskStallDefinition } from './mask'

/**
 * 全屋台 StallDefinition の登録(StallFramework §2.3 / §2.4)。
 *
 * 新屋台の追加手順(P2 以降の引き継ぎ):
 *  1. definitions/<id>.ts に StallDefinition を1件書く(id/displayName/placement/createScene/resultRules、
 *     固有会話があれば createDialogue)。
 *  2. 本ファイルで import し、createStallRegistry() の register に1行足す。
 * これだけで合成点(App.tsx)が Registry を回し、SceneManager(minigame)・近接・会話・結果を自動配線する。
 */
export function createStallRegistry(): StallRegistry {
  const registry = new StallRegistry()
  registry.register(goldfishStallDefinition)
  registry.register(superballStallDefinition) // P2 量産実証(SCOOP 原型・1行追加)
  registry.register(maskStallDefinition) // P2 量産実証(CHOICE 原型・1行追加)
  return registry
}

export { goldfishStallDefinition } from './goldfish'
export { superballStallDefinition } from './superball'
export { maskStallDefinition } from './mask'
