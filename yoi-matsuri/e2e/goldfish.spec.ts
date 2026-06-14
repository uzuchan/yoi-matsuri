import { expect, test, type Page } from '@playwright/test'

/**
 * T-006 金魚すくいシーンの主要動線 E2E。
 * 近接 → E → 会話 → 「遊んでいく」 → 金魚すくい(操作: 沈める/持ち上げ) → 退出/終了 → approach 復帰、
 * console error 0 を検証する。
 *
 * 観測は DOM(金魚 HUD .goldfish-hud / 会話 .dialogue の有無)とコンソールエラーで行う
 * (描画見た目は art-director の目視レビュー / TECHNICAL_ARCHITECTURE §6)。
 *
 * 徒歩+会話操作はソフトウェア描画(E2E は GPU 無効)で遅いため timeout を延長する(dialogue.spec と同方針)。
 */
test.describe.configure({ timeout: 120_000 })

const DIALOGUE = '.dialogue'
const CHOICE = '.dialogue__choice'
const GOLDFISH_HUD = '.goldfish-hud'
const GAUGE = '.goldfish-hud__gauge'
// T-007: 金魚すくい終了は result 経由で approach へ戻る(goldfish→result→approach)。
const RESULT = '.result'
const RESULT_BUTTON = '.result__button'

/** result オーバーレイで「参道へ戻る」を押して approach へ戻す(T-007: 終了は必ず result 経由)。 */
async function returnToApproachViaResult(page: Page): Promise<void> {
  await expect(page.locator(RESULT)).toBeVisible()
  await page.locator(RESULT_BUTTON).click()
  await page.waitForTimeout(400)
  await expect(page.locator(RESULT)).toHaveCount(0)
}

/** 参道入口からキーボードで屋台へ歩き、近接圏で E を押して会話を開く。 */
async function walkToStallAndOpen(page: Page): Promise<void> {
  await page.goto('/')
  const canvas = page.locator('canvas.game-canvas')
  await expect(canvas).toBeVisible()
  await canvas.click({ position: { x: 10, y: 10 } })

  await page.keyboard.down('KeyD')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyD')

  await page.keyboard.down('KeyW')
  let opened = false
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(150)
    await page.keyboard.press('KeyE')
    if (await page.locator(DIALOGUE).count()) {
      opened = true
      break
    }
  }
  await page.keyboard.up('KeyW')
  expect(opened, '屋台に到達して会話を開始できる').toBe(true)
  await expect(page.locator(DIALOGUE)).toBeVisible()
}

/** 会話を「遊んでいく」まで送り、金魚すくいへ入る。 */
async function enterGoldfish(page: Page): Promise<void> {
  // セリフを送り切って選択肢を出す。
  let choicesShown = false
  for (let i = 0; i < 8; i++) {
    if (await page.locator(CHOICE).count()) {
      choicesShown = true
      break
    }
    await page.keyboard.press('Enter')
    await page.waitForTimeout(80)
  }
  expect(choicesShown, '送り切ると選択肢が出る').toBe(true)

  // 「遊んでいく」(先頭)を Enter 確定 → goldfish へ。
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)

  // 会話オーバーレイが消え、金魚 HUD が出る(排他)。
  await expect(page.locator(DIALOGUE)).toHaveCount(0)
  await expect(page.locator(GOLDFISH_HUD)).toBeVisible()
  await expect(page.locator(GAUGE)).toBeVisible()
}

test('近接→E→会話→遊んでいく→金魚すくい操作(沈める/持ち上げ)→退出→approach 復帰', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)
  await enterGoldfish(page)

  // --- 金魚すくい操作: 画面中央(水槽の上)でポイを沈める→持ち上げを数回 ---
  const canvas = page.locator('canvas.game-canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

  for (let i = 0; i < 4; i++) {
    await page.mouse.move(cx + (i - 2) * 20, cy + (i - 2) * 12)
    await page.mouse.down() // 沈める(poi-dip)
    await page.waitForTimeout(120)
    await page.mouse.move(cx, cy)
    await page.mouse.up() // 持ち上げ(poi-lift・捕獲判定)
    await page.waitForTimeout(120)
  }

  // 操作中も HUD が出続けている(ゲージが見える)。
  await expect(page.locator(GOLDFISH_HUD)).toBeVisible()

  // --- Esc で退出 → result(終了画面)→「参道へ戻る」→ approach(HUD 消滅) ---
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await expect(page.locator(GOLDFISH_HUD)).toHaveCount(0)
  await returnToApproachViaResult(page)

  // 行き止まりなし: approach に戻り、再び会話を開ける。
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(200)
  await expect(page.locator(DIALOGUE)).toBeVisible()

  expect(errors).toEqual([])
})

test('金魚すくい中に紙を破る(雑に速く動かす)とセッションが終わり approach へ戻る', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)
  await enterGoldfish(page)

  const canvas = page.locator('canvas.game-canvas')
  const box = await canvas.boundingBox()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

  // 沈めたまま水槽内を速く激しく往復する → speed² ダメージで紙が破れる → 自動で終了 → approach。
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  let finished = false
  for (let i = 0; i < 120; i++) {
    const dx = i % 2 === 0 ? 90 : -90
    await page.mouse.move(cx + dx, cy + (i % 3 === 0 ? 40 : -40))
    await page.waitForTimeout(20)
    if ((await page.locator(GOLDFISH_HUD).count()) === 0) {
      finished = true
      break
    }
  }
  await page.mouse.up()
  expect(finished, '雑に速く動かすと紙が破れてセッションが終わる').toBe(true)

  // 破損(torn)でも result 経由で approach へ戻る(T-007)。
  await returnToApproachViaResult(page)

  // approach へ戻れている(再び会話を開ける = 行き止まりなし)。
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(200)
  await expect(page.locator(DIALOGUE)).toBeVisible()

  expect(errors).toEqual([])
})
