import {
  CanvasTexture,
  LinearFilter,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'
import { PALETTE } from './palette'
import type { WorldObject } from './types'

/**
 * 近接プロンプト「E: 屋台をのぞく」のワールド空間ラベル(T-003 AC6)。
 *
 * - Sprite なので常時カメラを向く(billboard)。
 * - テキストは canvas へ描いて CanvasTexture にする(外部画像アセット禁止 / src/ui を使わない)。
 * - fog:false でフォグに沈ませず視認性を確保(ART §2 UIテキスト色 #f5f0e8)。
 * - 近接で表示・離脱で非表示にする 0.2s フェード(setVisible + update(dt) で opacity を補間)。
 *
 * 文言は INTERACTION_SPEC §4 のとおり「E: 屋台をのぞく」をそのまま使う。
 */

const PROMPT_TEXT = 'E: 屋台をのぞく'

// canvas 解像度(テクスチャ)。文字がにじまない程度の余裕を持たせる。
const CANVAS_WIDTH = 512
const CANVAS_HEIGHT = 128
const FONT_PX = 56

// ワールドでの表示サイズ(Sprite scale。アスペクト比を canvas に合わせる)。
const SPRITE_WORLD_HEIGHT = 0.7
const SPRITE_WORLD_WIDTH = (SPRITE_WORLD_HEIGHT * CANVAS_WIDTH) / CANVAS_HEIGHT

// INTERACTION_SPEC §3.1 / §4: フェード 0.2s。
const FADE_DURATION = 0.2

/** プロンプトラベル。setVisible で表示/非表示を切替え、update(dt) で 0.2s フェードする。 */
export interface PromptLabel extends WorldObject {
  /**
   * 表示(true)/非表示(false)を要求する。通常は update(dt) が opacity を 0.2s で補間する。
   * @param immediate true のとき opacity を即時に目標値へ反映する(update 駆動を待たない)。
   *   会話遷移時など、本シーンの update が回らない状況でプロンプトを確実に消すために使う
   *   (INTERACTION_SPEC §3.2: 会話中はプロンプト非表示)。
   */
  setVisible(visible: boolean, immediate?: boolean): void
}

/**
 * プロンプトラベルを生成する。
 * @param position ラベルのワールド座標 {x,y,z}(屋台付近に置く)。
 */
export function createPromptLabel(position: { x: number; y: number; z: number }): PromptLabel {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('promptLabel: 2D canvas コンテキストを取得できませんでした')
  }
  drawPrompt(ctx)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthTest: false, // 屋台の手前に重なっても文字が隠れないように
    depthWrite: false,
    fog: false, // フォグに沈ませない(視認性確保)
  })

  const sprite = new Sprite(material)
  sprite.name = 'prompt-label'
  sprite.position.set(position.x, position.y, position.z)
  sprite.scale.set(SPRITE_WORLD_WIDTH, SPRITE_WORLD_HEIGHT, 1)
  sprite.visible = false // opacity 0 のうちは描画自体を省く

  let targetOpacity = 0

  return {
    object: sprite,
    setVisible(visible: boolean, immediate = false): void {
      targetOpacity = visible ? 1 : 0
      if (visible) sprite.visible = true // フェードイン開始時に可視化
      if (immediate) {
        // update 駆動を待たず opacity を即時に目標値へ反映する(会話遷移時の確実な非表示)。
        material.opacity = targetOpacity
        if (targetOpacity === 0) sprite.visible = false
      }
    },
    update(dt: number): void {
      const current = material.opacity
      if (current === targetOpacity) return
      const stepDir = targetOpacity > current ? 1 : -1
      const next = current + (stepDir * dt) / FADE_DURATION
      const clamped = stepDir > 0 ? Math.min(next, 1) : Math.max(next, 0)
      material.opacity = clamped
      // 完全に消えたら描画を省く。
      if (clamped === 0) sprite.visible = false
    },
    dispose(): void {
      texture.dispose()
      material.dispose()
    },
  }
}

/** canvas にプロンプト文字列を描く(背景透過、UIテキスト色 #f5f0e8、視認性のため縁取り付き)。 */
function drawPrompt(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.font = `600 ${FONT_PX}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = CANVAS_WIDTH / 2
  const cy = CANVAS_HEIGHT / 2

  // 夜空 #0a0e2e 寄りの暗い縁取りでコントラストを確保(背景パネルの代わり)。
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(10, 14, 46, 0.9)' // #0a0e2e
  ctx.strokeText(PROMPT_TEXT, cx, cy)

  ctx.fillStyle = PALETTE.stallCurtainWhite // #f5f0e8 = UIテキスト色
  ctx.fillText(PROMPT_TEXT, cx, cy)
}
