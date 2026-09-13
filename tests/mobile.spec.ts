import { chooseExample } from './ui'
import { test, expect } from '@playwright/test'
import { printedPhoto } from './printed-photo'

test('keeps photo recognition actions visible on short mobile screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles(await printedPhoto(page, 9))
  const dialog = page.getByRole('dialog')
  const recognize = dialog.getByRole('button', { name: 'Распознать числа', exact: true })
  await expect(recognize).toBeEnabled({ timeout: 30_000 })
  for (const viewport of [
    { width: 390, height: 640 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    for (const button of [recognize, dialog.getByRole('button', { name: 'Назад', exact: true })]) {
      await expect(button).toBeInViewport({ ratio: 1 })
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    }
    await dialog.locator('.crop-options').scrollIntoViewIfNeeded()
    await expect(recognize).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-photo-actions-${viewport.width}.png`,
    })
  }
  await page.setViewportSize({ width: 390, height: 640 })
  await recognize.click()
  await expect(page.getByRole('button', { name: 'Я проверил(а) числа по фотографии' })).toBeEnabled({
    timeout: 60_000,
  })
})

test('fits a phone viewport and supports two-digit input and enlargement', async ({ page }, testInfo) => {
  await page.goto('./')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await chooseExample(page, 16)
  await page.getByLabel('Строка 1, столбец 2', { exact: true }).fill('16')
  await expect(page.getByLabel('Строка 1, столбец 2', { exact: true })).toHaveValue('16')
  await page.getByRole('button', { name: 'Увеличить поле' }).click()
  await expect(page.locator('.zoomed-board')).toBeVisible()
  await page.getByRole('button', { name: 'Уменьшить поле' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await chooseExample(page, 16)
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
  await page.screenshot({ path: `test-results/${testInfo.project.name}-preview.png`, fullPage: true })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Сохранить решение', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('SudokuMaster-16x16.png')
})
