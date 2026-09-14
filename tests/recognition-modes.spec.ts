import { test, expect } from '@playwright/test'
import blueGivens from './fixtures/blue16-givens.json' with { type: 'json' }
import corpus from './fixtures/web/corpus.json' with { type: 'json' }

test('recognizes every blue printed number in the supplied 16×16 image by default', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/blue16.png')
  const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
  await expect(recognize).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('dialog').getByRole('combobox')).toHaveValue('16')
  await expect(page.getByRole('radio', { name: 'Все числа' })).toBeChecked()
  await recognize.click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 })
  const values = await page
    .locator('.cell input')
    .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)))
  expect(values).toEqual(blueGivens.flat())
})

test('removes handwriting only after selecting the printed mode and resets for the next photo', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/web/filled_0010.jpg')
  const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
  await expect(recognize).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('radio', { name: 'Все числа', exact: true })).toBeChecked()
  const printed = page.getByRole('radio', { name: 'Только печатные', exact: true })
  await printed.check()
  await expect(printed).toBeChecked()
  await recognize.click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 })
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
  ).toEqual(corpus.find((f) => f.id === 'filled_0010')!.printed)
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/blue16.png')
  await expect(recognize).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('radio', { name: 'Все числа', exact: true })).toBeChecked()
})
