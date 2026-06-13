/**
 * src/core 公開API(TECHNICAL_ARCHITECTURE §3)。
 * 他モジュール(scenes/world/ui/audio/game)はこのバレル経由でcoreへアクセスする。
 */
export { EventBus } from './EventBus'
export type { GameEvents, GameEventName, EventHandler } from './EventBus'
export { GameLoop } from './GameLoop'
export type { GameLoopOptions } from './GameLoop'
export { InputManager, GAME_KEYS } from './InputManager'
export type { GameKey, MouseState, InputEventTarget } from './InputManager'
export { SceneManager } from './SceneManager'
export type { Scene, SceneContext, SceneId } from './SceneManager'
export type {
  DialogueChoice,
  DialogueView,
  DialogueOutcome,
  DialogueController,
} from './Dialogue'
