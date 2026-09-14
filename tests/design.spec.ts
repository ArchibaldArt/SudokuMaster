import { test, expect } from '@playwright/test'
import { chooseExample, menuAction, setSpeed } from './ui'

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [390, 844],
  [320, 568],
]) {
  test(`keeps the board and photo actions accessible at ${width}×${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height })
    await page.goto('./')
    const grid = page.getByRole('grid', { name: 'Поле судоку 9 на 9', exact: true })
    const actions = page.getByRole('region', { name: 'Проверка и решение', exact: true })
    await expect(grid).toBeVisible()
    for (const name of ['Сделать фото', 'Загрузить фото']) {
      const button = actions.getByRole('button', { name, exact: true })
      await expect(button).toBeInViewport({ ratio: 1 })
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    }
    await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ввести вручную', exact: true })).toHaveCount(0)
    const first = page.getByLabel('Строка 1, столбец 1', { exact: true })
    await expect(first).toHaveAttribute('readonly', '')
    expect(
      await page
        .locator('.cell input')
        .evaluateAll((inputs) => inputs.every((input) => !(input as HTMLInputElement).value)),
    ).toBe(true)
    const box = (await grid.boundingBox())!
    expect(box.y).toBeLessThan(170)
    expect(box.width).toBeGreaterThanOrEqual(280)
    if (height >= 700) {
      await expect(grid).toBeInViewport({ ratio: 1 })
      if (width < 1024)
        expect(box.y + box.height).toBeLessThanOrEqual(
          (await page.locator('.workflow-dock').boundingBox())!.y,
        )
      else
        expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height)
    } else {
      await page.locator('.board-meta').scrollIntoViewIfNeeded()
      const last = (await page.getByLabel('Строка 9, столбец 9', { exact: true }).boundingBox())!
      expect(last.y + last.height).toBeLessThanOrEqual(
        (await page.locator('.workflow-dock').boundingBox())!.y,
      )
      await page.evaluate(() => window.scrollTo(0, 0))
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/${testInfo.project.name}-workspace-${width}.png` })
  })
}

test('defaults to fast solving and keeps editing and settings in secondary tools', async ({ page }) => {
  await page.goto('./')
  await menuAction(page, 'Настройки решения')
  await expect(page.getByLabel('Скорость решения')).toHaveValue('fast')
  await page.keyboard.press('Escape')
  await setSpeed(page, 'slow')
  await chooseExample(page, 9)
  await menuAction(page, 'Настройки решения')
  await expect(page.getByLabel('Скорость решения')).toHaveValue('slow')
  await page.keyboard.press('Escape')
  await page.reload()
  await menuAction(page, 'Настройки решения')
  await expect(page.getByLabel('Скорость решения')).toHaveValue('fast')
  await page.keyboard.press('Escape')
  await menuAction(page, 'Ввести вручную')
  const solve = page.getByRole('button', { name: 'Решить судоку', exact: true })
  await expect(solve).toBeDisabled()
  await page.getByLabel('Строка 1, столбец 1', { exact: true }).fill('1')
  await expect(solve).toBeDisabled()
  await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
  await expect(solve).toBeEnabled()
  await page.getByLabel('Строка 1, столбец 1', { exact: true }).click()
  await page.getByRole('button', { name: 'Правка', exact: true }).click()
  await page.getByRole('button', { name: 'Ввести 9', exact: true }).click()
  await page.getByRole('button', { name: 'Готово', exact: true }).click()
  await expect(page.getByLabel('Строка 1, столбец 1', { exact: true })).toHaveValue('9')
})
