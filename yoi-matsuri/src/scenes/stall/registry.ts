import type { WebGLRenderer } from 'three'
import type { DialogueController } from '../../core'
import type { StallResultRules } from '../../game/result'
import type { StallScene, StallPlacement } from './types'

/**
 * 屋台1件の定義(STALL_FRAMEWORK §2.1 / D-010)。
 *
 * 1屋台を、純TS層・描画層・会話・結果を束ねた1つの定義にする。型引数は使わず素直にする
 * (ジェネリクス推論の複雑化を避ける / §2.1。型安全は各 create 関数の内部で閉じる)。
 *
 * 配置(§1.4): Scene(three)・DialogueController を含むため core ではなく scenes 側に置く。
 *
 * 新屋台の追加手順(P2 以降の引き継ぎ): definitions/<id>.ts に StallDefinition を1件書き、
 * definitions/index.ts のバレルへ1行 import を足すだけで、合成点(App.tsx)が Registry を回して
 * SceneManager 登録・近接・会話・結果を自動配線する。
 */
export interface StallDefinition {
  /** 屋台ID(stall:approach の stallId・近接・遷移 payload・図鑑キー)。例 'goldfish-stall'。 */
  readonly id: string
  /** 屋号(店主会話・プロンプト・結果見出しに使う表示名)。例 '金魚すくい'。 */
  readonly displayName: string
  /** 参道上の配置(近接判定・プロンプト位置・結果カメラの基準)。 */
  readonly placement: StallPlacement
  /**
   * ミニゲーム Scene を生成する。renderer を受け、汎用 'minigame' シーンの中身として駆動される。
   * GoldfishScene 相当。Scene.id は 'minigame' を返す(§3.2)。遅延生成契約(呼ばれたら生成 / §7)。
   */
  readonly createScene: (renderer: WebGLRenderer) => StallScene
  /**
   * 店主会話の DialogueController を生成する(D-008 の契約)。会話は屋台ごとに差し替わる。
   * 省略時は合成点が displayName から汎用会話(createGenericStallDialogue)を自動生成する(§2.5)。
   */
  readonly createDialogue?: () => DialogueController
  /** 結果の score→tier→{見出し/店主セリフ/報酬} 規則(§5)。屋台固有の文言・報酬を供給。 */
  readonly resultRules: StallResultRules
}

/**
 * 屋台定義の登録簿(STALL_FRAMEWORK §2.3)。合成点が回して屋台を自動配線する。
 * SceneManager.register と同じ厳格さで id 重複・未登録を throw する。
 */
export class StallRegistry {
  private readonly defs = new Map<string, StallDefinition>()

  /** 屋台を登録する。id 重複は throw。 */
  register(def: StallDefinition): void {
    if (this.defs.has(def.id)) {
      throw new Error(`StallRegistry: 屋台 "${def.id}" は登録済みです`)
    }
    this.defs.set(def.id, def)
  }

  /** id で屋台を引く。未登録は throw。 */
  get(id: string): StallDefinition {
    const def = this.defs.get(id)
    if (!def) {
      throw new Error(`StallRegistry: 屋台 "${id}" は未登録です`)
    }
    return def
  }

  /** 登録済みか。 */
  has(id: string): boolean {
    return this.defs.has(id)
  }

  /** 登録済み屋台を登録順で返す。 */
  getAll(): readonly StallDefinition[] {
    return [...this.defs.values()]
  }
}
