import { test, expect } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { chooseExample, menuAction } from './ui'
import { getExample } from '../src/data/examples'
import { compositeExample } from '../src/data/composite'
import { cellLabel, topology } from '../src/core/topology'

async function expectAllChoicesVisible(dialog: Locator) {
  for (const button of await dialog
    .getByRole('group', { name: 'Число в клетке' })
    .getByRole('button')
    .all()) {
    await expect(button).toBeInViewport({ ratio: 1 })
    const bounds = (await button.boundingBox())!
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    expect(bounds.width).toBeGreaterThanOrEqual(44)
  }
  await expect(dialog.locator('.editor-current-value')).toBeInViewport({ ratio: 1 })
  await expect(dialog.locator('.cell-editor-footer')).toBeInViewport({ ratio: 1 })
  for (const region of [dialog, dialog.locator('.cell-editor-body')]) {
    expect(await region.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
    expect(await region.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  }
}

test('highlights the current number, preserves corrections and updates the photo while navigating', async ({
  page,
}, info) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/blue16.png')
  const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
  await expect(recognize).toBeEnabled({ timeout: 30000 })
  await recognize.click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 })
  const uncertain = await page.locator('.cell.uncertain').first().getAttribute('data-cell-id')
  await page.locator('[data-cell-id="30"] input').click()
  await page.getByRole('button', { name: 'Правка', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Правка клетки' })
  const next = dialog.getByRole('button', { name: 'Проверено, дальше', exact: true })
  const previous = dialog.getByRole('button', { name: 'Предыдущая клетка', exact: true })
  const five = dialog.getByRole('button', { name: 'Ввести 5', exact: true })
  const fourteen = dialog.getByRole('button', { name: 'Ввести 14', exact: true })
  const crop = dialog.getByRole('img', { name: 'Фрагмент выбранной клетки на фотографии' })
  const originalCrop = await crop.getAttribute('style')
  await expect(five).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('img', { name: 'Число в поле: 5', exact: true })).toHaveText('5')
  const color = await five.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await fourteen.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(color)
  await fourteen.click()
  await expect(fourteen).toHaveAttribute('aria-pressed', 'true')
  await expect(five).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByRole('button', { pressed: true })).toHaveCount(1)
  const originalViewport = page.viewportSize()!
  for (const viewport of [
    { width: 1440, height: 844 },
    { width: 1440, height: 640 },
    { width: 1440, height: 580 },
    { width: 390, height: 640 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    await expectAllChoicesVisible(dialog)
    await expect(crop).toBeInViewport({ ratio: 1 })
    const sourceBox = (await crop.boundingBox())!
    const valueBox = (await dialog.getByRole('img', { name: 'Число в поле: 14', exact: true }).boundingBox())!
    expect(valueBox.width).toBeCloseTo(sourceBox.width, 1)
    expect(valueBox.height).toBeCloseTo(sourceBox.height, 1)
    expect(valueBox.width).toBeCloseTo(valueBox.height, 1)
    expect(valueBox.y).toBeCloseTo(sourceBox.y, 1)
    expect(valueBox.x).toBeGreaterThan(sourceBox.x + sourceBox.width)
    const label = (await dialog.locator('.editor-cell-info').boundingBox())!
    expect(label.x).toBeGreaterThan(valueBox.x + valueBox.width)
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await dialog.screenshot({
      path: info.outputPath(`cell-comparison-${viewport.width}-${viewport.height}.png`),
    })
  }
  await page.setViewportSize(originalViewport)
  await next.click()
  await expect(dialog.locator('.editor-cell-label')).toHaveText('Строка 2, столбец 16')
  await expect(crop).not.toHaveAttribute('style', originalCrop!)
  await next.click()
  await expect(dialog.locator('.editor-cell-label')).toHaveText('Строка 3, столбец 1')
  await previous.click()
  await previous.click()
  await expect(fourteen).toHaveAttribute('aria-pressed', 'true')
  await expect(crop).toHaveAttribute('style', originalCrop!)
  const empty = dialog
    .getByRole('group', { name: 'Число в клетке' })
    .getByRole('button', { name: 'Пусто', exact: true })
  await empty.click()
  await expect(empty).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { pressed: true })).toHaveCount(1)
  await expect(dialog.getByRole('img', { name: 'Клетка в поле пустая', exact: true })).toBeEmpty()
  await next.click()
  await previous.click()
  await expect(dialog.getByRole('img', { name: 'Клетка в поле пустая', exact: true })).toBeEmpty()
  await expect(empty).toHaveAttribute('aria-pressed', 'true')
  await five.click()
  await expect(empty).toHaveAttribute('aria-pressed', 'false')
  await dialog.screenshot({ path: info.outputPath('selected-number.png') })
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click()
  await expect(page.locator('[data-cell-id="30"] input')).toHaveValue('5')

  // Visiting another cell must not silently confirm it; explicitly proceeding does.
  expect(uncertain).not.toBeNull()
  await page.locator(`[data-cell-id="${uncertain}"] input`).click()
  await page.getByRole('button', { name: 'Правка', exact: true }).click()
  await next.click()
  await expect(page.locator(`[data-cell-id="${uncertain}"]`)).not.toHaveClass(/uncertain/)
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeDisabled()
})

test('reviews all 81 cells in order, including blanks, and stops at the last cell', async ({ page }) => {
  await page.goto('./')
  await chooseExample(page, 9)
  await page.locator('[data-cell-id="0"] input').click()
  await page.getByRole('button', { name: 'Правка', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Правка клетки' })
  const next = dialog.getByRole('button', { name: 'Проверено, дальше', exact: true })
  await expect(dialog.getByRole('button', { name: 'Предыдущая клетка' })).toBeDisabled()
  const puzzle = getExample(9)
  for (let i = 0; i < 81; i++) {
    await expect(dialog.getByRole('status')).toHaveText(`Клетка ${i + 1} из 81`)
    await expect(dialog.locator('.editor-cell-label')).toHaveText(cellLabel(puzzle, i))
    const value = puzzle.givens[i]
    await expect(dialog.getByRole('button', { pressed: true })).toHaveCount(1)
    await expect(
      dialog.getByRole('button', { name: value ? `Ввести ${value}` : 'Пусто', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    if (i < 80) await next.click()
  }
  await expect(next).toBeDisabled()
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
  ).toEqual(puzzle.givens)
})

test('navigates across gaps and shared cells in a composite without repeating them', async ({ page }) => {
  await page.goto('./')
  await menuAction(page, 'Составное · 8 полей')
  const select = page.getByLabel('Выбрать поле', { exact: true })
  await select.selectOption('0')
  await page.locator('[data-cell-id="8"] input').click()
  await page.getByRole('button', { name: 'Правка', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Правка клетки' })
  const next = dialog.getByRole('button', { name: 'Проверено, дальше', exact: true })
  await next.click()
  await expect(dialog.locator('.editor-cell-label')).toHaveText('Поле 2: строка 1, столбец 1')
  await expect(select).toHaveValue('1')
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click()

  const puzzle = compositeExample('eight')
  const shared = topology(puzzle).cells.findIndex((cell) => cell.boards.length > 1)
  await select.selectOption('0')
  await page.locator(`[data-cell-id="${shared}"] input`).click()
  await page.getByRole('button', { name: 'Правка', exact: true }).click()
  await expect(dialog.locator('.editor-cell-label')).toHaveText(cellLabel(puzzle, shared))
  await expect(dialog.getByRole('status')).toHaveText(`Клетка ${shared + 1} из ${puzzle.givens.length}`)
  await next.click()
  await expect(dialog.locator('.editor-cell-label')).toHaveText(cellLabel(puzzle, shared + 1))
  await expect(dialog.getByRole('status')).toHaveText(`Клетка ${shared + 2} из ${puzzle.givens.length}`)
  await dialog.getByRole('button', { name: 'Предыдущая клетка' }).click()
  await expect(dialog.locator('.editor-cell-label')).toHaveText(cellLabel(puzzle, shared))
})

test('shows every editor choice without scrolling on small screens', async ({ page }, info) => {
  await page.goto('./')
  await chooseExample(page, 16)
  await page.locator('[data-cell-id="0"] input').click()
  await page.getByRole('button', { name: 'Правка', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Правка клетки' })
  for (const viewport of [
    { width: 390, height: 640 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    await expectAllChoicesVisible(dialog)
    const footer = dialog.locator('.cell-editor-footer')
    await expect(footer).toBeInViewport({ ratio: 1 })
    const before = await footer.boundingBox()
    await dialog.getByRole('button', { name: 'Ввести 16', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Ввести 16', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await footer.boundingBox()).toEqual(before)
    await expect(footer).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`editor-${viewport.width}.png`) })
    await dialog.getByRole('button', { name: 'Проверено, дальше', exact: true }).click()
    await expect(dialog.locator('.editor-cell-label')).toBeInViewport({ ratio: 1 })
    await expect(dialog.locator('.editor-current-value')).toBeInViewport({ ratio: 1 })
  }
})
