import { expect, test, type Page } from '@playwright/test'

/**
 * T-010 / QUALITY_GATES G2-1: 主要動線の「1 本の通し」E2E。
 *
 * 既存の e2e(dialogue / goldfish / result)は各シーン単位で動線が分散しているため、
 * 本スペックは QUALITY_GATES G2-1 が要求する一連の通し
 *   起動 → 参道移動 → 会話開始 → 金魚すくい → 結果 → 参道復帰
 * を「1 本のテスト」で端から端まで辿り、各画面の遷移と console error 0 を一括で担保する。
 *
 * 観測は DOM(canvas / .dialogue / .goldfish-hud / .result / .inventory)とコンソールで行う
 * (描画見た目は art-director の目視レビュー / TECHNICAL_ARCHITECTURE §6)。
 *
 * E2E は GPU 無効(ソフトウェア描画)で徒歩+会話操作が遅く、並列実行の CPU 競合でさらに
 * 時間がかかるため timeout を延長する(dialogue/goldfish/result spec と同方針)。
 *
 * フレーキー対策(プロダクションコードは触らない / T-010 Forbidden):
 *  - 屋台到達は「W を押しっぱなしで E をポーリング」で近接圏入りを待つ
 *  - キーボード確定(Enter)は GameLoop の update 間でエッジを取りこぼしうるため down/up を
 *    分けて押下時間を確保しつつ、画面が切り替わるまで再試行する(REV-T-007-1 Minor-1 と同手法)
 */
test.describe.configure({ timeout: 150_000 })

const CANVAS = 'canvas.game-canvas'
const DIALOGUE = '.dialogue'
const CHOICE = '.dialogue__choice'
const GOLDFISH_HUD = '.goldfish-hud'
const GAUGE = '.goldfish-hud__gauge'
const RESULT = '.result'
const RESULT_HEADING = '.result__heading'
const RESULT_BUTTON = '.result__button'
const INVENTORY = '.inventory'

/** 参道入口から屋台へ歩いて近接圏に入り、会話を開く(起動→参道移動→会話開始)。 */
async function startupWalkAndOpenDialogue(page: Page): Promise<void> {
  await page.goto('/')
  const canvas = page.locator(CANVAS)
  await expect(canvas).toBeVisible() // 起動: canvas が出る
  await canvas.click({ position: { x: 10, y: 10 } }) // フォーカスを window へ

  // 屋台は中腹右(x=+5, z=-26)。まず D で x をクランプ、その後 W 全速で前進し近接圏 3m を待つ。
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyD')

  await page.keyboard.down('KeyW')
  let opened = false
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(150)
    await page.keyboard.press('KeyE')
    if (await page.locator(DIALOGUE).count()) {
      // P2: お面屋(z=-23.5)が金魚すくい(z=-26)の手前にあるため、手前の会話が先に開きうる。
      // 金魚すくいの会話(イントロに「金魚」)以外なら Esc で閉じて歩き続け、金魚すくいに到達する。
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
  expect(opened, '参道を歩いて金魚すくい屋台に到達し会話を開始できる').toBe(true)
  await expect(page.locator(DIALOGUE)).toBeVisible()
}

/** 会話を送り切って「遊んでいく」を確定し、金魚すくいへ入る(会話→金魚すくい)。 */
async function advanceDialogueAndEnterGoldfish(page: Page): Promise<void> {
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
  await expect(page.locator(CHOICE).nth(0)).toHaveText('遊んでいく')

  // 「遊んでいく」(先頭)を確定 → goldfish。会話オーバーレイが消え、金魚 HUD が出る(排他)。
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)
  await expect(page.locator(GOLDFISH_HUD)).toBeVisible()
  await expect(page.locator(GAUGE)).toBeVisible()
}

/** 沈めたまま水槽内を速く動かして紙を破り、セッションを終わらせる(金魚すくい→結果へ)。 */
async function playGoldfishUntilFinished(page: Page): Promise<void> {
  const canvas = page.locator(CANVAS)
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

  // まず通常操作(沈める→持ち上げ)が HUD を壊さないことを確認(操作の手応え経路)。
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.waitForTimeout(120)
  await page.mouse.up()
  await expect(page.locator(GOLDFISH_HUD)).toBeVisible()

  // 沈めたまま速く激しく往復 → speed² ダメージで紙が破れ、自動で result へ。
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
  expect(finished, '金魚すくいが終了し result へ遷移する').toBe(true)
}

test('通し主要動線: 起動→参道移動→会話開始→金魚すくい→結果→参道復帰(1 本・console error 0)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  // 1) 起動 → 参道移動 → 会話開始
  await startupWalkAndOpenDialogue(page)

  // 2) 会話開始 → 金魚すくい
  await advanceDialogueAndEnterGoldfish(page)

  // 3) 金魚すくい → 結果
  await playGoldfishUntilFinished(page)

  // 4) 結果画面: 段の見出し・店主セリフ・報酬・「参道へ戻る」が出る(会話/金魚 HUD は排他で消えている)
  await expect(page.locator(RESULT)).toBeVisible()
  await expect(page.locator(GOLDFISH_HUD)).toHaveCount(0)
  await expect(page.locator(DIALOGUE)).toHaveCount(0)
  await expect(page.locator(RESULT_HEADING)).not.toBeEmpty()
  await expect(page.locator('.result__line-text')).not.toBeEmpty()
  await expect(page.locator('.result__reward-name')).not.toBeEmpty()
  await expect(page.locator(RESULT_BUTTON)).toBeVisible()

  // 5) 結果 → 参道復帰(マウス経路: 「参道へ戻る」クリック)
  await page.locator(RESULT_BUTTON).click()
  await page.waitForTimeout(400)
  await expect(page.locator(RESULT)).toHaveCount(0)

  // approach に復帰し、所持品スロットに報酬が蓄積している(行き止まりなし / AC5)
  await expect(page.locator(INVENTORY)).toBeVisible()
  await expect(page.locator('.inventory__item')).toHaveCount(1)

  // 6) 通し完結後も行き止まりなし: 再び近接 E で会話を開ける
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(200)
  await expect(page.locator(DIALOGUE)).toBeVisible()

  // 通し全行程で重大コンソールエラー 0(G2-2)
  expect(errors).toEqual([])
})
