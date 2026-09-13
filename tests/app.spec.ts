import { chooseExample, menuAction, setSpeed } from './ui'
import { test, expect } from '@playwright/test'
import { getExample } from '../src/data/examples'

test('solves 9×9, downloads a real PNG and preserves givens', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('main', { name: 'Рабочий стол судоку' })).toBeVisible()
  await chooseExample(page, 9)
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
  await page.screenshot({ path: `test-results/${testInfo.project.name}-preview.png`, fullPage: true })
  const values = await page
    .locator('.cell input')
    .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)))
  expect(values.every((v) => v >= 1 && v <= 9)).toBeTruthy()
  getExample(9).givens.forEach((v, i) => {
    if (v) expect(values[i]).toBe(v)
  })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Сохранить решение', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('SudokuMaster-9x9.png')
  const stream = await download.createReadStream(),
    chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const png = Buffer.concat(chunks)
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.readUInt32BE(16)).toBe(1208)
  expect(png.readUInt32BE(20)).toBe(1308)
  expect(errors).toEqual([])
})

test('solves the 16×16 magazine example', async ({ page }) => {
  await page.goto('./')
  await chooseExample(page, 16)
  await expect(page.locator('.cell')).toHaveCount(256)
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
  const values = await page
    .locator('.cell input')
    .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)))
  const puzzle = getExample(16)
  puzzle.givens.forEach((v, i) => {
    if (v) expect(values[i]).toBe(v)
  })
  for (let r = 0; r < 16; r++) expect(new Set(values.slice(r * 16, r * 16 + 16)).size).toBe(16)
})

test('rejects duplicate givens and handles a puzzle without solutions', async ({ page }) => {
  await page.goto('./')
  await chooseExample(page, 9)
  await page.getByLabel('Строка 1, столбец 3', { exact: true }).fill('5')
  await expect(page.getByText('В исходных числах есть конфликт')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeDisabled()
  await page.getByLabel('Строка 1, столбец 3', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('У этой задачи нет решения')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить решение', exact: true })).toHaveCount(0)
})

test('pauses actual search, resumes and stops without stale events', async ({ page }) => {
  await page.goto('./')
  await chooseExample(page, 9)
  await setSpeed(page, 'slow')
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await page.waitForTimeout(150)
  const paused = await page
    .locator('.cell input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  await page.waitForTimeout(650)
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
  ).toEqual(paused)
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await page.getByRole('button', { name: 'Остановить', exact: true }).click()
  await chooseExample(page, 16)
  await page.waitForTimeout(500)
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
  ).toEqual(getExample(16).givens)
})

test('explains multiple solutions instead of falsely claiming uniqueness', async ({ page }) => {
  await page.goto('./')
  await menuAction(page, 'Ввести вручную')
  await page.getByLabel('Строка 1, столбец 1', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Есть несколько решений', { exact: true })).toBeVisible()
})

test('fails gracefully for unsupported uploads and leaves manual input working', async ({ page }) => {
  await page.goto('./')
  await page
    .getByLabel('Загрузить фотографию судоку')
    .setInputFiles({ name: 'example.heic', mimeType: 'image/heic', buffer: Buffer.from('invalid') })
  await expect(page.getByRole('alert')).toContainText('JPEG, PNG или WebP')
  await page.getByRole('button', { name: 'Закрыть обработку фотографии' }).click()
  await menuAction(page, 'Ввести вручную')
  await page.getByLabel('Строка 1, столбец 3', { exact: true }).fill('4')
  await expect(page.getByLabel('Строка 1, столбец 3', { exact: true })).toHaveValue('4')
})

test('suspends on the computation budget and continues the same search', async ({ page }) => {
  await page.context().route('**/solver.worker.ts*', async (route) => {
    const response = await route.fetch()
    const clock = `{
      const realNow = performance.now.bind(performance);
      let simulateBudget = true, tick = 0;
      Object.defineProperty(performance, 'now', {value: () => simulateBudget ? (tick += 16000) : realNow()});
      self.addEventListener('message', event => { if (event.data.type === 'continue') simulateBudget = false; });
    }\n`
    await route.fulfill({ response, body: clock + (await response.text()) })
  })
  await page.goto('./')
  await chooseExample(page, 9)
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Поиск приостановлен', { exact: true })).toBeVisible()
  await expect(page.getByText('У этой задачи нет решения')).toHaveCount(0)
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
})
