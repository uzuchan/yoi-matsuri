import type { Object3D } from 'three'

/**
 * world/ ビルダーの共通戻り値。
 * - object: シーンへ add する Object3D(ルート)
 * - dispose: 生成した geometry / material / texture を解放する(idempotent前提)
 * - update?: 毎フレーム駆動が要る場合のみ実装(dtは秒)。揺れ等の動的要素に使う
 */
export interface WorldObject {
  object: Object3D
  dispose(): void
  update?(dt: number): void
}
