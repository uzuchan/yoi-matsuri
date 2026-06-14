import { expect, test, type Page } from '@playwright/test'

/**
 * T-004 会話システムの主要動線 E2E。
 * 近接 → E → 会話開始 → セリフ送り → 「またあとで」→ approach 復帰 を検証する。
 * 会話の各分岐(またあとで / Esc / 遊んでいく)とマウス/キーボード両経路もカバーする。
 *
 * 観測は DOM(会話オーバーレイ .dialogue の有無・テキスト)とコンソールエラーで行う
 * (描画見た目は art-director の目視レビュー / TECHNICAL_ARCHITECTURE §6)。
 *
 * 屋台までの徒歩はソフトウェア描画(E2E は GPU 無効)では遅く、並列実行の CPU 競合で
 * さらに時間がかかる。歩行+会話操作を 30s 既定では取りこぼすため、各テストの timeout を延長する。
 */
test.describe.configure({ timeout: 90_000 })

const DIALOGUE = '.dialogue'
const PANEL = '.dialogue__panel'
const CHOICE = '.dialogue__choice'

/** 参道入口からキーボードで屋台へ歩き、近接プロンプト圏内に入って会話を開く。 */
async function walkToStallAndOpen(page: Page): Promise<void> {
  await page.goto('/')
  const canvas = page.locator('canvas.game-canvas')
  await expect(canvas).toBeVisible()
  await canvas.click({ position: { x: 10, y: 10 } }) // フォーカスを canvas/window へ

  // 屋台は中腹右(x=+5, z=-26)。まず右(D)へ寄せて x=4 にクランプし、その後 前進(W)を
  // 全速(対角だと各軸が約0.7倍になり遅い)で行う。近接圏 3m に入ったら E で会話を開く。
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(1500) // x=4 へクランプ
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

/** セリフ送り中なら全文表示、表示済みなら次へ進める(キーボード Enter)。 */
async function advanceWithKeyboard(page: Page): Promise<void> {
  await page.keyboard.press('Enter')
  await page.waitForTimeout(80)
}

test('近接→E→会話開始→セリフ送り→「またあとで」→approach 復帰(キーボード)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)

  // 2 つのセリフを送る(各セリフ: 全文即時表示 → 次へ、で最大 2 回ずつ)。
  // 選択肢が出るまで Enter を送り続ける。
  let choicesShown = false
  for (let i = 0; i < 8; i++) {
    if (await page.locator(CHOICE).count()) {
      choicesShown = true
      break
    }
    await advanceWithKeyboard(page)
  }
  expect(choicesShown, '送り切ると選択肢が表示される').toBe(true)
  await expect(page.locator(CHOICE)).toHaveCount(2)
  await expect(page.locator(CHOICE).nth(0)).toHaveText('遊んでいく')
  await expect(page.locator(CHOICE).nth(1)).toHaveText('またあとで')

  // 「またあとで」(2 番目)へフォーカス移動して確定。
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(60)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(120)

  // 締めセリフ「おう、また来な!」を送り切ると会話が閉じ approach へ戻る(オーバーレイ消滅)。
  for (let i = 0; i < 6; i++) {
    if ((await page.locator(DIALOGUE).count()) === 0) break
    await advanceWithKeyboard(page)
  }
  await expect(page.locator(DIALOGUE)).toHaveCount(0)

  // approach へ戻れたので、再度近接圏内で E を押すと会話を開き直せる(行き止まりなし)。
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(150)
  await expect(page.locator(DIALOGUE)).toBeVisible()

  expect(errors).toEqual([])
})

test('Esc で会話を打ち切り approach へ戻る', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)
  await expect(page.locator(DIALOGUE)).toBeVisible()

  // Esc 立ち上がりは GameLoop の update 間で取りこぼしうる(GPU 無効・並列負荷)。
  // 会話が閉じるまで Esc を再試行する(検証する挙動 = Esc で打ち切り approach へ戻る は不変)。
  let closed = false
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(120)
    if ((await page.locator(DIALOGUE).count()) === 0) {
      closed = true
      break
    }
  }
  expect(closed, 'Esc で会話が打ち切られる').toBe(true)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)

  expect(errors).toEqual([])
})

test('マウスのみで会話を完結できる(クリック送り→ホバー/クリックで「またあとで」確定)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)

  // パネルをクリックして送り、選択肢が出るまで進める(クリック経路)。
  let choicesShown = false
  for (let i = 0; i < 10; i++) {
    if (await page.locator(CHOICE).count()) {
      choicesShown = true
      break
    }
    await page.locator(PANEL).click()
    await page.waitForTimeout(90)
  }
  expect(choicesShown, 'クリック送りで選択肢が表示される').toBe(true)

  // 「またあとで」をクリック確定 → 締めセリフ → クリックで送り切る → approach 復帰。
  await page.locator(CHOICE).nth(1).click()
  await page.waitForTimeout(120)
  for (let i = 0; i < 6; i++) {
    if ((await page.locator(DIALOGUE).count()) === 0) break
    if (await page.locator(PANEL).count()) await page.locator(PANEL).click()
    await page.waitForTimeout(100)
  }
  await expect(page.locator(DIALOGUE)).toHaveCount(0)

  expect(errors).toEqual([])
})

// T-006 で goldfish シーンが登録され、「遊んでいく」は本遷移(dialogue→goldfish)になった。
// 旧 T-004 の「goldfish 未登録 → approach フォールバック」は撤去済み(App.routeChoice の try/catch を本遷移へ差し替え)。
// 以下 2 件は新しい本遷移(会話を閉じて金魚すくい HUD が出る)を検証する。
const GOLDFISH_HUD = '.goldfish-hud'

test('「遊んでいく」を選ぶと金魚すくいへ遷移する(キーボード / T-006 本結線)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)

  let choicesShown = false
  for (let i = 0; i < 8; i++) {
    if (await page.locator(CHOICE).count()) {
      choicesShown = true
      break
    }
    await advanceWithKeyboard(page)
  }
  expect(choicesShown).toBe(true)

  // 「遊んでいく」(先頭)を Enter 確定 → goldfish へ本遷移。会話が閉じ、金魚 HUD が出る(排他)。
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)
  await expect(page.locator(GOLDFISH_HUD)).toBeVisible()

  expect(errors).toEqual([])
})

test('マウスで「遊んでいく」を選ぶと金魚すくいへ遷移する(クリック / T-006 本結線)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await walkToStallAndOpen(page)

  // クリック送りで選択肢へ。
  let choicesShown = false
  for (let i = 0; i < 10; i++) {
    if (await page.locator(CHOICE).count()) {
      choicesShown = true
      break
    }
    await page.locator(PANEL).click()
    await page.waitForTimeout(90)
  }
  expect(choicesShown).toBe(true)

  // 「遊んでいく」(先頭)をクリック確定 → goldfish へ本遷移。会話が閉じ金魚 HUD が出る。
  await page.locator(CHOICE).nth(0).click()
  await page.waitForTimeout(300)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)
  await expect(page.locator(GOLDFISH_HUD)).toBeVisible()

  expect(errors).toEqual([])
})
