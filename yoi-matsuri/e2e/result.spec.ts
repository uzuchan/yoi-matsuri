import { expect, test, type Page } from '@playwright/test'

/**
 * T-007 結果画面・店主の反応・報酬・参道復帰 の主要動線 E2E。
 *
 * 通しループ: 近接 → E → 会話 → 「遊んでいく」 → 金魚すくい → (破損/退出) → result(段表示) →
 * 「参道へ戻る」 → approach(所持品スロットに報酬) を検証し、console error 0 を確認する。
 *
 * 段(0匹/1-2匹/3匹以上)の見出し・店主セリフ・報酬の対応は game/result の純TS unit test
 * (tests/game/result.test.ts)が境界 0/1/2/3 で網羅する。E2E はソフトウェア描画(GPU 無効)で
 * 確保数を狙って作るのが不安定なため、実プレイで確実に作れる「失敗(0匹=破損/時間切れ)」段を
 * 画面で検証し、結果画面の構造(見出し・店主セリフ・報酬・「参道へ戻る」)と通しループ・所持品反映を担保する。
 *
 * 観測は DOM(.result / .result__heading / .result__reward-name / .inventory)とコンソールで行う。
 */
test.describe.configure({ timeout: 120_000 })

const DIALOGUE = '.dialogue'
const CHOICE = '.dialogue__choice'
const GOLDFISH_HUD = '.goldfish-hud'
const RESULT = '.result'
const RESULT_HEADING = '.result__heading'
const RESULT_BUTTON = '.result__button'
const INVENTORY = '.inventory'

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
      // P2: お面屋(z=-23.5)が金魚すくい(z=-26)の手前に並ぶため、手前の会話が先に開きうる。
      // 金魚すくいの会話(イントロに「金魚」)以外なら Esc で閉じて歩き続ける。
      await page.keyboard.press('Enter')
      await page.waitForTimeout(120)
      const text = (await page.locator('.dialogue__text').first().textContent()) ?? ''
      if (text.includes('金魚')) {
        opened = true
        break
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
    }
  }
  await page.keyboard.up('KeyW')
  expect(opened, '金魚すくい屋台に到達して会話を開始できる').toBe(true)
  await expect(page.locator(DIALOGUE)).toBeVisible()
}

/** 会話を「遊んでいく」まで送り、金魚すくいへ入る。 */
async function enterGoldfish(page: Page): Promise<void> {
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

  await page.keyboard.press('Enter') // 「遊んでいく」(先頭)を確定 → goldfish
  await page.waitForTimeout(300)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)
  await expect(page.locator(GOLDFISH_HUD)).toBeVisible()
}

/** 沈めたまま水槽内を速く激しく動かして紙を破り、セッションを終わらせる(確保 0 匹 = 失敗段)。 */
async function tearPaper(page: Page): Promise<void> {
  const canvas = page.locator('canvas.game-canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

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
}

/**
 * キーボードのみで「参道へ戻る」を確定する(result → approach)。
 * 並列負荷下では Enter の極短押下が GameLoop の update 間に入りエッジを取りこぼすことがあるため
 * (REV-T-007-1 Minor-1)、down/up を分けて押下時間を確保しつつ、結果が閉じるまで再試行する。
 */
async function confirmReturnByKeyboard(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.down('Enter')
    await page.waitForTimeout(40)
    await page.keyboard.up('Enter')
    await page.waitForTimeout(120)
    if ((await page.locator(RESULT).count()) === 0) return
  }
  await expect(page.locator(RESULT)).toHaveCount(0)
}

test('通しループ: 金魚すくい終了 → result(段表示・店主反応・報酬) → 参道へ戻る → approach(所持品に報酬)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)
  await enterGoldfish(page)
  await tearPaper(page)

  // --- result シーン: 結果オーバーレイが出る(会話/金魚 HUD は排他で消えている) ---
  await expect(page.locator(RESULT)).toBeVisible()
  await expect(page.locator(GOLDFISH_HUD)).toHaveCount(0)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)

  // 失敗段(0匹): 見出し・店主セリフ・報酬(ラムネ風アメ)が表示される(GDD §3.2 / INTERACTION_SPEC §4)。
  await expect(page.locator(RESULT_HEADING)).toHaveText('ポイが破れてしまった…')
  await expect(page.locator('.result__panel')).toHaveClass(/result__panel--fail/)
  await expect(page.locator('.result__line-text')).toContainText('また挑戦しな')
  await expect(page.locator('.result__reward-name')).toHaveText('ラムネ風アメ')

  // 「参道へ戻る」ボタンが見える(行き止まりなし / INTERACTION_SPEC §3.4)。
  await expect(page.locator(RESULT_BUTTON)).toBeVisible()

  // --- 参道へ戻る(マウス経路: ボタンクリック)→ approach 復帰 ---
  await page.locator(RESULT_BUTTON).click()
  await page.waitForTimeout(400)
  await expect(page.locator(RESULT)).toHaveCount(0)

  // 所持品スロットに獲得報酬が残っている(approach 右下 / AC5・AC7)。
  await expect(page.locator(INVENTORY)).toBeVisible()
  await expect(page.locator(INVENTORY)).toContainText('ラムネ風アメ')

  // 行き止まりなし: approach に戻り、再び会話を開ける。
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(200)
  await expect(page.locator(DIALOGUE)).toBeVisible()

  expect(errors).toEqual([])
})

test('キーボードのみで result を進められる(Enter で参道へ戻る)+ 所持品が蓄積する', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  // 1 周目: 失敗 → 報酬1個。
  await walkToStallAndOpen(page)
  await enterGoldfish(page)
  await tearPaper(page)
  await expect(page.locator(RESULT)).toBeVisible()

  // キーボードのみ(Enter)で「参道へ戻る」(§1原則: キーボードのみで完結)。
  await confirmReturnByKeyboard(page)
  await expect(page.locator(RESULT)).toHaveCount(0)
  await expect(page.locator(INVENTORY)).toBeVisible()

  const countAfterFirst = await page.locator('.inventory__item').count()
  expect(countAfterFirst).toBeGreaterThanOrEqual(1)

  // 2 周目: もう一度遊んで終了 → 所持品が積み上がる(実動作で蓄積 / AC5)。
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(200)
  await expect(page.locator(DIALOGUE)).toBeVisible()
  await enterGoldfish(page)
  await tearPaper(page)
  await expect(page.locator(RESULT)).toBeVisible()
  await confirmReturnByKeyboard(page)
  await expect(page.locator(INVENTORY)).toBeVisible()

  const countAfterSecond = await page.locator('.inventory__item').count()
  expect(countAfterSecond, '所持品は周回ごとに蓄積する').toBe(countAfterFirst + 1)

  expect(errors).toEqual([])
})
