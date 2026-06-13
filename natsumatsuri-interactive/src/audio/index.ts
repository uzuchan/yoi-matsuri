/**
 * src/audio 公開API(T-008 / AUDIO_SPEC §5)。
 * 合成点(App.tsx)はこのバレル経由で AudioEngine を生成・配線する。
 * ゲームコード(core/game/scenes/world/ui)はここを import しない(EventBus 購読のみ / TECHNICAL_ARCHITECTURE §2)。
 */
export { AudioEngine } from './AudioEngine'
export { SFX_NAMES, SFX_REGISTRY, resolveSfx } from './sfx'
export type { SfxSynth } from './sfx'
