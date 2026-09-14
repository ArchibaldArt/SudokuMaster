import { test, expect } from '@playwright/test'

const airplane = [
  '210430070',
  '000000850',
  '004007013',
  '000002095',
  '000819000',
  '960700000',
  '890500700',
  '021000000',
  '030078069',
]
  .join('')
  .split('')
  .map(Number)

test('recognizes the blue printed airplane photograph from Wikimedia', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/web/airplane.jpg')
  const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
  await expect(recognize).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('dialog').getByRole('combobox')).toHaveValue('9')
  await recognize.click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 })
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
  ).toEqual(airplane)
})
