/**
 * ビジュアル磨き before/after 比較スクショ(一時・PoC)。
 *
 * 参道シーンを (1) 起動直後の歩行ビュー (2) 初回花火の開花付近 で撮る。
 * FPS表示(?debug=1)込み・実GPU(ANGLE Metal)。
 *
 * 前提: 別ターミナルで build 済みの preview を 127.0.0.1:4173 で起動しておく。
 * 実行: node scripts/polish-screens.mjs <suffix>   (出力名末尾。例 before / after)
 * 出力: ../reports/screenshots/POLISH-approach-<suffix>.png / POLISH-burst-<suffix>.png
 */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = join(ROOT, '..', 'reports', 'screenshots')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'
const SUFFIX = process.argv[2] ?? 'before'

const GPU_ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  const out = join(OUT_DIR, name)
  await page.screenshot({ path: out })
  console.log(`wrote ${out}`)
}

async function main() {
  const browser = await chromium.launch({ headless: false, args: GPU_ARGS })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/?debug=1`)
    await page.locator('canvas.game-canvas').waitFor({ state: 'visible' })
    // 起動操作(autoplay解錠 + 描画開始)。少し前進して屋台・提灯・群衆が画面に入る歩行ビューにする。
    await page.locator('canvas.game-canvas').click({ position: { x: 10, y: 10 } })
    await sleep(1200)
    await shot(page, `POLISH-approach-${SUFFIX}.png`)
    // 初回花火: launch=8s, burst=9.2s, 残光〜11s。開花の見える 9.6s 付近を狙う。
    // すでに約1.2s 経過しているので、合計 9.6s になるよう待つ。
    await sleep(8400)
    await shot(page, `POLISH-burst-${SUFFIX}.png`)
    await context.close()
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
