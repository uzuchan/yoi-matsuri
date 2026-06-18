/**
 * F-004 店主視認性 before/after 比較スクショ(一時・PoC)。
 *
 * 結果画面(金魚すくいを紙破りで終了 → result)を 1280×720・実GPU・FPS表示(?debug=1)で撮る。
 * 店主が結果パネル脇でどれだけ読めるか(F-004)を before/after で比較する。
 *
 * 前提: 別ターミナルで build 済みの preview を 127.0.0.1:4173 で起動しておく。
 * 実行: node scripts/keeper-result-screens.mjs <suffix>   (例 before / after)
 * 出力: ../reports/screenshots/F004-result-<suffix>.png
 */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = join(ROOT, '..', 'reports', 'screenshots')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'
const SUFFIX = process.argv[2] ?? 'before'

const GPU_ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
const DIALOGUE = '.dialogue'
const CHOICE = '.dialogue__choice'
const GOLDFISH_HUD = '.goldfish-hud'
const RESULT = '.result'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function walkToGoldfishDialogue(page) {
  await page.locator('canvas.game-canvas').click({ position: { x: 10, y: 10 } })
  await page.keyboard.down('KeyD')
  await sleep(1500)
  await page.keyboard.up('KeyD')
  await page.keyboard.down('KeyW')
  let opened = false
  for (let i = 0; i < 120; i++) {
    await sleep(150)
    await page.keyboard.press('KeyE')
    if (await page.locator(DIALOGUE).count()) {
      await page.keyboard.press('Enter')
      await sleep(120)
      const text = (await page.locator('.dialogue__text').first().textContent().catch(() => '')) ?? ''
      if (text.includes('金魚')) {
        opened = true
        break
      }
      await page.keyboard.press('Escape')
      await sleep(150)
    }
  }
  await page.keyboard.up('KeyW')
  if (!opened) throw new Error('金魚すくいの会話に到達できなかった')
}

async function enterGoldfish(page) {
  let shown = false
  for (let i = 0; i < 30; i++) {
    if (await page.locator(CHOICE).count()) {
      shown = true
      break
    }
    await page.keyboard.down('Enter')
    await sleep(50)
    await page.keyboard.up('Enter')
    await sleep(200)
  }
  if (!shown) throw new Error('会話の選択肢が出なかった')
  await page.locator(CHOICE).first().click()
  await page.locator(GOLDFISH_HUD).waitFor({ state: 'visible', timeout: 10_000 })
}

async function tearPaperToResult(page) {
  const box = await page.locator('canvas.game-canvas').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i < 120; i++) {
    const dx = i % 2 === 0 ? 90 : -90
    await page.mouse.move(cx + dx, cy + (i % 3 === 0 ? 40 : -40))
    await sleep(20)
    if ((await page.locator(GOLDFISH_HUD).count()) === 0) break
  }
  await page.mouse.up()
  await page.locator(RESULT).waitFor({ state: 'visible', timeout: 10_000 })
}

async function captureOnce(browser, outName) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  try {
    await page.goto(`${BASE}/?debug=1`)
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' })
    await sleep(1200)
    await walkToGoldfishDialogue(page)
    await enterGoldfish(page)
    await tearPaperToResult(page)
    await sleep(2000)
    const out = join(OUT_DIR, outName)
    await page.screenshot({ path: out })
    console.log(`wrote ${out}`)
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false, args: GPU_ARGS })
  try {
    let lastErr
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await captureOnce(browser, `F004-result-${SUFFIX}.png`)
        return
      } catch (e) {
        lastErr = e
        console.warn(`[retry ${attempt}] ${e.message}`)
      }
    }
    throw lastErr
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
