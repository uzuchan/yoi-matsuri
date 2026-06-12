import { expect, test } from '@playwright/test'

test('起動するとcanvasが表示され、3秒間console error / pageerrorが0件である', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  await page.goto('/')

  const canvas = page.locator('canvas.game-canvas')
  await expect(canvas).toBeVisible()

  // ゲームループが3秒間走ってもエラーが出ないこと(AC8 / QUALITY_GATES G2-2)
  await page.waitForTimeout(3000)

  expect(errors).toEqual([])
})
