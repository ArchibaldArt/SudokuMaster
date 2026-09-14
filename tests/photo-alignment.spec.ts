import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function geometry(page: Page) {
  return page.locator('.grid-viewport').evaluate((viewport) => {
    const rect = viewport.getBoundingClientRect()
    return {
      scroll: [viewport.scrollLeft, viewport.scrollTop],
      size: [viewport.clientWidth, viewport.clientHeight, viewport.scrollWidth, viewport.scrollHeight],
      cells: Array.from(viewport.querySelectorAll('[data-cell-id]')).map((cell) => {
        const bounds = cell.getBoundingClientRect()
        return [
          cell.getAttribute('data-cell-id'),
          bounds.x - rect.x,
          bounds.y - rect.y,
          bounds.width,
          bounds.height,
        ]
      }),
    }
  })
}

async function compareViews(page: Page) {
  const before = await geometry(page)
  await page.getByRole('button', { name: 'Показать фото', exact: true }).click()
  await expect(page.getByRole('grid', { name: 'Фотография судоку для проверки', exact: true })).toBeVisible()
  expect(await geometry(page)).toEqual(before)
  const images = page.locator('.cell-photo')
  expect(await images.count()).toBe(before.cells.length)
  expect(
    await images.evaluateAll((elements) =>
      elements.every((element) => {
        const cell = element.parentElement!,
          bounds = element.getBoundingClientRect()
        return (
          Math.abs(bounds.width - cell.clientWidth) < 1 &&
          Math.abs(bounds.height - cell.clientHeight) < 1 &&
          getComputedStyle(cell.querySelector('input')!).visibility === 'hidden'
        )
      }),
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Вернуться к полю', exact: true }).click()
  expect(await geometry(page)).toEqual(before)
}

for (const composite of [false, true]) {
  test(`aligns photo and grid through zoom, scrolling and ${composite ? 'eight-board navigation' : 'classic 16×16 review'}`, async ({
    page,
  }, info) => {
    test.setTimeout(120000)
    await page.goto('./')
    await page
      .getByLabel('Загрузить фотографию судоку')
      .setInputFiles(composite ? 'tests/fixtures/composite8.png' : 'tests/fixtures/blue16.png')
    const recognize = page.getByRole('button', {
      name: composite ? 'Схема верна — распознать числа' : 'Распознать числа',
      exact: true,
    })
    await expect(recognize).toBeEnabled({ timeout: 30000 })
    await recognize.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 90000 })
    const check = page.getByRole('button', { name: 'Проверить судоку', exact: true })
    await expect(check).toHaveCount(0)
    if (composite) await page.getByLabel('Выбрать поле', { exact: true }).selectOption('all')
    await compareViews(page)
    const original = (await page.locator('.sudoku-grid').boundingBox())!
    for (let i = 0; i < 3; i++)
      await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Масштаб 25%, сбросить до 100%', exact: true }),
    ).toBeVisible()
    const small = (await page.locator('.sudoku-grid').boundingBox())!
    expect(Math.abs(small.width / original.width - 0.25)).toBeLessThan(0.01)
    await expect(page.getByRole('button', { name: 'Уменьшить масштаб', exact: true })).toBeDisabled()
    await compareViews(page)
    await page.getByRole('button', { name: 'Масштаб 25%, сбросить до 100%', exact: true }).click()
    for (let i = 0; i < 4; i++)
      await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()
    await page.locator('.grid-viewport').evaluate((viewport) => viewport.scrollTo(130, 170))
    expect((await geometry(page)).scroll[0]).toBeGreaterThan(0)
    await compareViews(page)
    await page.getByRole('button', { name: 'Показать фото', exact: true }).click()
    if (composite) {
      await page.getByLabel('Выбрать поле', { exact: true }).selectOption('7')
      await expect(page.locator('.cell-photo')).toHaveCount(81)
      await expect(
        page.getByRole('button', { name: 'Масштаб 200%, сбросить до 100%', exact: true }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Вернуться к полю', exact: true }).click()
      await expect(page.getByLabel('Выбрать поле', { exact: true })).toHaveValue('7')
      await compareViews(page)
      await page.getByRole('button', { name: 'Показать фото', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Масштаб 200%, сбросить до 100%', exact: true }).click()
    await page.locator('.grid-viewport').evaluate((viewport) => viewport.scrollTo(0, 0))
    await page.locator('.sudoku-grid').screenshot({ path: info.outputPath('aligned-photo.png') })
    await page.getByRole('button', { name: 'Вернуться к полю', exact: true }).click()
    await page.locator('.sudoku-grid').screenshot({ path: info.outputPath('aligned-grid.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
