import { chooseExample, menuAction } from './ui'
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

test('reserves the mobile screen for the photo grid while keeping review actions reachable', async ({
  page,
}, info) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/magazine16.png')
  await expect(page.getByRole('button', { name: 'Распознать числа', exact: true })).toBeEnabled({
    timeout: 30000,
  })
  await page.getByRole('radio', { name: 'Только печатные' }).check()
  await page.getByRole('button', { name: 'Распознать числа', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 })
  for (const viewport of [
    { width: 390, height: 640 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    const confirm = page.getByRole('button', { name: 'Я проверил(а) числа по фотографии', exact: true })
    await expect(confirm).toBeInViewport({ ratio: 1 })
    const dock = (await page.locator('.workflow-dock').boundingBox())!
    const grid = (await page.locator('.grid-viewport').boundingBox())!
    await page.screenshot({ path: info.outputPath(`review-${viewport.width}.png`) })
    await info.attach(`layout-${viewport.width}`, {
      body: JSON.stringify({ viewport, dock, grid }),
      contentType: 'application/json',
    })
    if (viewport.width < 640) {
      expect(dock.height).toBeLessThanOrEqual(160)
      expect(grid.height).toBeGreaterThanOrEqual(viewport.width - 40)
      expect(grid.y + grid.height).toBeLessThanOrEqual(dock.y)
    } else {
      expect(grid.height).toBeGreaterThanOrEqual(200)
      expect(grid.x + grid.width).toBeLessThanOrEqual(dock.x)
    }
    for (const button of [
      confirm,
      page.getByRole('button', { name: 'Показать фото', exact: true }),
      page.getByRole('button', { name: 'Увеличить масштаб', exact: true }),
    ]) {
      await expect(button).toBeInViewport({ ratio: 1 })
      const bounds = (await button.boundingBox())!
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const board = page.locator('.sudoku-grid')
    // WebKit rounds the scrollport to whole pixels; allow a fraction of a pixel at the border.
    await expect(board).toBeInViewport({ ratio: 0.999 })
    const before = await board.boundingBox()
    await page.getByRole('button', { name: 'Показать фото', exact: true }).click()
    expect(await board.boundingBox()).toEqual(before)
    await page.getByRole('button', { name: 'Вернуться к полю', exact: true }).click()
    expect(await board.boundingBox()).toEqual(before)
  }
  await page.setViewportSize({ width: 390, height: 640 })
  await page.getByRole('button', { name: /Следующая сомнительная клетка/ }).click()
  await expect(page.getByRole('dialog', { name: 'Правка клетки' })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть: Правка клетки' }).click()
  const area = page.locator('.grid-viewport')
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()
  const toolbar = await page.locator('.board-toolbar').boundingBox()
  await area.evaluate((element) => element.scrollTo(element.scrollWidth, element.scrollHeight))
  expect(await area.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await page.locator('.board-toolbar').boundingBox()).toEqual(toolbar)
  await expect(page.getByRole('button', { name: 'Показать фото', exact: true })).toBeInViewport({ ratio: 1 })
})

test('keeps composition navigation compact and puts result actions side by side', async ({ page }, info) => {
  await page.goto('./')
  await menuAction(page, 'Составное · 8 полей')
  const select = page.getByLabel('Выбрать поле', { exact: true })
  for (const viewport of [
    { width: 390, height: 640 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    expect((await page.locator('.composition-nav').boundingBox())!.height).toBeLessThanOrEqual(48)
    await expect(select).toBeInViewport({ ratio: 1 })
    await page.getByRole('button', { name: 'Карта полей', exact: true }).click()
    const map = page.getByRole('dialog', { name: 'Схема полей', exact: true })
    await expect(map).toBeVisible()
    await map.getByRole('button', { name: 'Перейти к полю 2', exact: true }).click()
    await expect(map).toHaveCount(0)
    await expect(select).toHaveValue('1')
    await expect(page.locator('.cell')).toHaveCount(81)
    const area = (await page.locator('.grid-viewport').boundingBox())!
    expect(area.height).toBeGreaterThanOrEqual(viewport.width < 640 ? viewport.width - 100 : 160)
    await page.screenshot({ path: info.outputPath(`composition-${viewport.width}.png`) })
    await select.selectOption('all')
    const toolbar = await page.locator('.board-toolbar').boundingBox()
    await page.locator('.grid-viewport').evaluate((element) => element.scrollTo(0, element.scrollHeight))
    expect(await page.locator('.board-toolbar').boundingBox()).toEqual(toolbar)
    await expect(select).toBeInViewport({ ratio: 1 })
    await select.selectOption('1')
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
  const save = page.getByRole('button', { name: 'Сохранить решение', exact: true })
  const next = page.getByRole('button', { name: 'Новая задача', exact: true })
  for (const button of [save, next]) {
    await expect(button).toBeInViewport({ ratio: 1 })
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  }
  expect((await save.boundingBox())!.y).toBe((await next.boundingBox())!.y)
  expect((await page.locator('.workflow-dock').boundingBox())!.height).toBeLessThanOrEqual(160)
  await page.screenshot({ path: info.outputPath('solved-320.png') })
  await menuAction(page, 'Вернуться к исходной задаче')
  await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeEnabled()
})

test('shows one primary action during manual entry on a small phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  const camera = page.getByRole('button', { name: 'Сделать фото', exact: true })
  const upload = page.getByRole('button', { name: 'Загрузить фото', exact: true })
  expect((await camera.boundingBox())!.y).toBe((await upload.boundingBox())!.y)
  await menuAction(page, 'Ввести вручную')
  await page.getByLabel('Строка 1, столбец 1', { exact: true }).fill('1')
  const confirm = page.getByRole('button', { name: 'Я заполнил числа', exact: true })
  const solve = page.getByRole('button', { name: 'Решить судоку', exact: true })
  await expect(confirm).toBeInViewport({ ratio: 1 })
  await expect(solve).toBeHidden()
  expect((await page.locator('.workflow-dock').boundingBox())!.height).toBeLessThanOrEqual(110)
  await page.screenshot({ path: info.outputPath('manual-320.png') })
  await confirm.click()
  await expect(page.getByText('Есть несколько решений', { exact: true })).toBeVisible()
  await expect(solve).toBeInViewport({ ratio: 1 })
  expect((await page.locator('.workflow-dock').boundingBox())!.height).toBeLessThanOrEqual(160)
})
