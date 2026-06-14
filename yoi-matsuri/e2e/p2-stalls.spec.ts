import { expect, test, type Page } from '@playwright/test'

/**
 * P2 量産屋台(スーパーボールすくい / お面屋)の主要動線 E2E。
 * 各屋台で「近接 → E → 会話 → 遊技 → 結果 → 参道復帰」を 1 周し、console error 0 を検証する。
 * 金魚すくいと同じ通し動線が、定義+登録だけで増えた屋台でも成立することを担保する(量産実証)。
 *
 * 観測は DOM(.dialogue / .goldfish-hud(汎用 StallHud)/ .result / .inventory)とコンソールで行う。
 * E2E は GPU 無効(ソフトウェア描画)で徒歩+操作が遅いため timeout を延長する。
 */
test.describe.configure({ timeout: 150_000 })

const CANVAS = 'canvas.game-canvas'
const DIALOGUE = '.dialogue'
const DIALOGUE_TEXT = '.dialogue__text'
const CHOICE = '.dialogue__choice'
const STALL_HUD = '.goldfish-hud' // 汎用 StallHud は金魚由来の CSS クラスを共有する
const RESULT = '.result'
const RESULT_BUTTON = '.result__button'
const INVENTORY = '.inventory'

/**
 * 参道入口から屋台へ歩き、イントロに `introNeedle` を含む屋台の会話を開く。
 * 別屋台の会話が先に開いたら Esc で閉じて歩き続ける(P2 で屋台が密に並ぶため)。
 */
async function walkToStallWithIntro(page: Page, introNeedle: string): Promise<void> {
  await page.goto('/')
  const canvas = page.locator(CANVAS)
  await expect(canvas).toBeVisible()
  await canvas.click({ position: { x: 10, y: 10 } })

  // 右側(x=+5.6)へ寄せてから前進。
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyD')

  await page.keyboard.down('KeyW')
  let opened = false
  for (let i = 0; i < 140; i++) {
    await page.waitForTimeout(150)
    await page.keyboard.press('KeyE')
    if (await page.locator(DIALOGUE).count()) {
      await page.keyboard.press('Enter') // 送り中の全文を即時表示
      await page.waitForTimeout(120)
      const text = (await page.locator(DIALOGUE_TEXT).first().textContent()) ?? ''
      if (text.includes(introNeedle)) {
        opened = true
        break
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
    }
  }
  await page.keyboard.up('KeyW')
  expect(opened, `屋台(${introNeedle})に到達して会話を開始できる`).toBe(true)
  await expect(page.locator(DIALOGUE)).toBeVisible()
}

/** 会話を送り切って先頭の選択肢(遊ぶ/選ぶ)を確定する。 */
async function confirmPlayChoice(page: Page): Promise<void> {
  let choicesShown = false
  for (let i = 0; i < 8; i++) {
    if (await page.locator(CHOICE).count()) {
      choicesShown = true
      break
    }
    await page.keyboard.press('Enter')
    await page.waitForTimeout(80)
  }
  expect(choicesShown, '会話を送り切ると選択肢が出る').toBe(true)
  await page.keyboard.press('Enter') // 先頭(遊んでいく / お面を選ぶ)を確定
  await page.waitForTimeout(300)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)
}

/** result で「参道へ戻る」を押して approach へ戻す。 */
async function returnViaResult(page: Page): Promise<void> {
  await expect(page.locator(RESULT)).toBeVisible()
  await expect(page.locator('.result__heading')).not.toBeEmpty()
  await expect(page.locator('.result__reward-name')).not.toBeEmpty()
  await page.locator(RESULT_BUTTON).click()
  await page.waitForTimeout(400)
  await expect(page.locator(RESULT)).toHaveCount(0)
}

test('スーパーボールすくい: 近接→会話→遊技(沈める/持ち上げ)→紙を破って終了→結果→参道復帰', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallWithIntro(page, 'スーパーボール')
  await confirmPlayChoice(page)
  // 汎用 StallHud が出る(ミニゲーム active)。
  await expect(page.locator(STALL_HUD)).toBeVisible()

  // 水槽中央で操作。まず通常の沈める→持ち上げ(手応え経路)。
  const canvas = page.locator(CANVAS)
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.waitForTimeout(120)
  await page.mouse.up()
  await expect(page.locator(STALL_HUD)).toBeVisible()

  // 沈めたまま速く往復 → speed² で紙が破れ自動終了 → result。
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  let finished = false
  for (let i = 0; i < 160; i++) {
    const dx = i % 2 === 0 ? 90 : -90
    await page.mouse.move(cx + dx, cy + (i % 3 === 0 ? 40 : -40))
    await page.waitForTimeout(20)
    if ((await page.locator(STALL_HUD).count()) === 0) {
      finished = true
      break
    }
  }
  await page.mouse.up()
  expect(finished, '速く動かすと紙が破れて終了する(SCOOP の手触り)').toBe(true)

  await returnViaResult(page)
  await expect(page.locator(INVENTORY)).toBeVisible()
  await expect(page.locator('.inventory__item')).toHaveCount(1)

  // 行き止まりなし: 再び近接 E で会話を開ける。
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(200)
  await expect(page.locator(DIALOGUE)).toBeVisible()

  expect(errors).toEqual([])
})

test('お面屋(キーボード): 近接→会話→お面を選ぶ→Enter で確定→結果→参道復帰', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallWithIntro(page, 'お面')
  await confirmPlayChoice(page)
  // 汎用 StallHud が出る(お面選択 active。時間表示なし)。
  await expect(page.locator(STALL_HUD)).toBeVisible()

  // ←→ でフォーカスを動かし(キーボード)、Enter で確定 → result。
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(120)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(120)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)

  // お面屋は失敗概念なし=選べば必ず成功以上 → 結果(報酬=お面)。
  await returnViaResult(page)
  await expect(page.locator(INVENTORY)).toBeVisible()
  await expect(page.locator('.inventory__item')).toHaveCount(1)

  expect(errors).toEqual([])
})

test('お面屋(マウス): お面をクリックで選んで確定できる(マウスのみ完結)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallWithIntro(page, 'お面')
  await confirmPlayChoice(page)
  await expect(page.locator(STALL_HUD)).toBeVisible()

  // 画面中央(中央のお面の上)をクリックして確定 → result。
  const canvas = page.locator(CANVAS)
  const box = await canvas.boundingBox()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(120) // ホバーでフォーカス
  // クリック確定はマウス押下の立ち上がりで判定するため、down→保持→up で 1 フレーム以上押下を確保する
  // (高速 click だと押下が 1 フレーム内に解放されエッジを取りこぼす)。
  await page.mouse.down()
  await page.waitForTimeout(120)
  await page.mouse.up()
  await page.waitForTimeout(300)

  await returnViaResult(page)
  await expect(page.locator(INVENTORY)).toBeVisible()

  expect(errors).toEqual([])
})
