import { test, expect } from '@playwright/test'
import { menuAction } from './ui'
import { emptyLayout, layouts, topology } from '../src/core/topology'

test('keeps linked boards readable and shares edits between focused boards', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await menuAction(page, 'Составное · 8 полей')
  await expect(page.locator('.cell input')).toHaveCount(81)
  expect(
    await page
      .locator('.cell input')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(18)
  const t = topology(emptyLayout(layouts.eight.boards)),
    id = t.at.get('6,6')!
  const shared = page.locator(`[data-cell-id="${id}"] input`)
  await shared.fill('')
  await page.getByLabel('Выбрать поле', { exact: true }).selectOption('2')
  await expect(page.locator('.cell input')).toHaveCount(81)
  await expect(shared).toHaveValue('')
  await shared.fill('3')
  await page.getByLabel('Выбрать поле', { exact: true }).selectOption('0')
  await expect(shared).toHaveValue('3')
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`focused-${viewport.width}.png`), fullPage: true })
  }
  await page.getByLabel('Выбрать поле', { exact: true }).selectOption('all')
  await expect(page.locator('.cell input')).toHaveCount(576)
  await expect(shared).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const beforeGap = page.locator(`[data-cell-id="${t.at.get('8,0')}"] input`)
  await beforeGap.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator(`[data-cell-id="${t.at.get('12,0')}"] input`)).toBeFocused()
})

test('keeps composite photo actions visible while correcting an invalid layout', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/composite8.png')
  const recognize = page.getByRole('button', { name: 'Схема верна — распознать числа', exact: true })
  await expect(recognize).toBeEnabled({ timeout: 30_000 })
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    const box = (await recognize.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    expect(box.height).toBeGreaterThanOrEqual(48)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('dialog').screenshot({ path: info.outputPath(`photo-${viewport.width}.png`) })
  }
  await page.getByRole('button', { name: 'Исправить схему', exact: true }).click()
  await page.getByLabel('Поле для правки границ').selectOption('2')
  const handle = page.getByRole('button', { name: 'Угол 1 поля 3', exact: true })
  await handle.scrollIntoViewIfNeeded()
  const original = await handle.evaluate((el) => ({
    x: Number(el.getAttribute('cx')),
    scale: (el as SVGGraphicsElement).getScreenCTM()!.a,
  }))
  const h = (await handle.boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + h.width / 2 + 8, h.y + h.height / 2, { steps: 8 })
  await page.mouse.up()
  // Pointer coordinates are rounded to device pixels in WebKit.
  expect(Math.abs((Number(await handle.getAttribute('cx')) - original.x) * original.scale - 8)).toBeLessThan(
    1.5,
  )
  await page.getByRole('button', { name: 'Удалить поле 3', exact: true }).click()
  await expect(recognize).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Соедините поля')
  await page.getByText('Выбрать другую схему', { exact: true }).click()
  await page.getByRole('button', { name: 'Составное · 8 полей', exact: true }).click()
  await expect(recognize).toBeEnabled()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
