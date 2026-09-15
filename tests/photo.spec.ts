import { chooseExample, menuAction } from './ui'
import { test, expect } from '@playwright/test'
import { getExample } from '../src/data/examples'
import { writeFile } from 'node:fs/promises'
import { printedPhoto } from './printed-photo'

for (const size of [9, 16] as const)
  test(`recognizes a clean printed ${size}×${size} grid locally, requires confirmation and solves it`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const errors: string[] = [],
      external: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin)
        external.push(request.url())
    })
    await page.goto('./')
    const givens = getExample(size).givens
    await page.getByLabel('Загрузить фотографию судоку').setInputFiles(await printedPhoto(page, size))
    await expect(page.getByRole('button', { name: 'Распознать числа' })).toBeEnabled({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Распознать числа' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 })
    const recognized = await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)))
    expect(recognized).toEqual(givens)
    const actions = page.getByRole('region', { name: 'Проверка и решение', exact: true })
    const confirm = actions.getByRole('button', { name: 'Я проверил(а) числа по фотографии', exact: true })
    const solve = actions.getByRole('button', { name: 'Решить судоку', exact: true, includeHidden: true })
    await expect(actions.getByText('Сначала проверим числа', { exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(actions.getByRole('status').getByRole('button')).toHaveCount(0)
    await expect(confirm).toBeEnabled()
    await expect(solve).toBeDisabled()
    await page.getByRole('button', { name: 'Показать фото', exact: true }).click()
    await expect(page.locator('.photo-grid')).toBeVisible()
    await expect(page.locator('.cell-photo').first()).toBeVisible()
    await page.getByRole('button', { name: 'Вернуться к полю', exact: true }).click()
    await expect(page.locator('.cell input')).toHaveCount(size * size)

    if (testInfo.project.name === 'webkit' && size === 16) {
      await page.setViewportSize({ width: 320, height: 720 })
    }
    await actions.scrollIntoViewIfNeeded()
    const confirmBox = (await confirm.boundingBox())!
    expect(confirmBox.height).toBeGreaterThanOrEqual(48)
    if (page.viewportSize()!.width >= 1024) {
      const solveBox = (await solve.boundingBox())!
      expect(solveBox.height).toBeGreaterThanOrEqual(48)
      expect(solveBox.y).toBeGreaterThan(confirmBox.y + confirmBox.height)
    } else await expect(solve).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await actions.screenshot({ path: `test-results/${testInfo.project.name}-review-${size}.png` })
    if (size === 16) {
      await page.getByRole('button', { name: 'Увеличить поле', exact: true }).click()
      await expect(confirm).toBeVisible()
      await page.getByRole('button', { name: 'Уменьшить поле', exact: true }).click()
    }
    await confirm.focus()
    await page.keyboard.press('Space')
    await expect(confirm).toHaveCount(0)
    await expect(solve).toBeEnabled()
    await expect(solve).toBeFocused()
    await expect(actions.getByText('Корректное судоку', { exact: true })).toBeVisible()
    await expect(actions.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0)
    await expect(page.locator('.cell.uncertain')).toHaveCount(0)
    expect(
      await page
        .locator('.cell input')
        .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
    ).toEqual(givens)
    await actions.screenshot({ path: `test-results/${testInfo.project.name}-confirmed-${size}.png` })
    await page.getByRole('button', { name: 'Решить судоку', exact: true, includeHidden: true }).click()
    await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
    expect(external).toEqual([])
  })

test('recognizes the annotated magazine photograph and permits correcting every discrepancy', async ({
  page,
}, testInfo) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/magazine16.png')
  await expect(page.getByRole('button', { name: 'Распознать числа' })).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('dialog').getByRole('combobox')).toHaveValue('16')
  await page.getByRole('radio', { name: 'Только печатные' }).check()
  if (process.env.OCR_DEBUG) {
    const debug = await page.evaluate(async () => {
      const path = '/src/services/photo.ts'
      const { PhotoProcessor, readPhoto } = await import(path)
      const svg = document.querySelector('.crop-stage svg')!
      const href = svg.querySelector('image')!.getAttribute('href')!
      const corners = Array.from(svg.querySelectorAll('circle')).map((p) => ({
        x: Number(p.getAttribute('cx')),
        y: Number(p.getAttribute('cy')),
      }))
      const source = await readPhoto(
        new File([await (await fetch(href)).blob()], 'debug.jpg', { type: 'image/jpeg' }),
      )
      const processor = new PhotoProcessor()
      try {
        const prepared = await processor.request('prepare', source, { corners, size: 16, mode: 'printed' })
        const canvas = document.createElement('canvas')
        canvas.width = 1600
        canvas.height = 1000
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const original = document.createElement('canvas')
        original.width = prepared.width
        original.height = prepared.height
        original
          .getContext('2d')!
          .putImageData(new ImageData(prepared.data, prepared.width, prepared.height), 0, 0)
        for (const cell of prepared.cells.slice(0, 64)) {
          const x = (cell.index % 16) * 100,
            y = Math.floor(cell.index / 16) * 250
          ctx.drawImage(original, cell.rect.x, cell.rect.y, cell.rect.w, cell.rect.h, x + 5, y + 5, 90, 90)
          if (cell.data) {
            const img = document.createElement('canvas')
            img.width = cell.width
            img.height = cell.height
            const pixels = new Uint8ClampedArray(cell.data.length * 4)
            for (let i = 0; i < cell.data.length; i++) {
              pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = cell.data[i]
              pixels[i * 4 + 3] = 255
            }
            img.getContext('2d')!.putImageData(new ImageData(pixels, cell.width, cell.height), 0, 0)
            ctx.drawImage(img, x + 5, y + 105, 90, 90)
          }
          ctx.fillStyle = '#666'
          ctx.font = '12px Arial'
          ctx.fillText(`${Math.floor(cell.index / 16) + 1},${(cell.index % 16) + 1}`, x + 5, y + 225)
          ctx.strokeStyle = '#ddd'
          ctx.strokeRect(x, y, 100, 250)
        }
        return canvas.toDataURL('image/png').split(',')[1]
      } finally {
        processor.cancel()
      }
    })
    await writeFile('/tmp/sudokumaster-ocr-cells.png', Buffer.from(debug, 'base64'))
  }
  await page.getByRole('button', { name: 'Распознать числа' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 })
  const recognized = await page
    .locator('.cell input')
    .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)))
  const expected = getExample(16).givens
  const discrepancies = expected.flatMap((value, index) =>
    value === recognized[index]
      ? []
      : [
          {
            row: Math.floor(index / 16) + 1,
            col: (index % 16) + 1,
            expected: value,
            actual: recognized[index],
          },
        ],
  )
  const report = {
    printed: expected.filter(Boolean).length,
    correctlyRecognizedPrinted: expected.filter((v, i) => v && recognized[i] === v).length,
    falsePositives: expected.filter((v, i) => !v && recognized[i]).length,
    discrepancies,
  }
  console.log('Magazine OCR:', JSON.stringify(report))
  await testInfo.attach('magazine-ocr.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  })
  // Accuracy is measured; handwritten photographs deliberately retain a review step.
  expect(report.correctlyRecognizedPrinted).toBeGreaterThanOrEqual(98)
  expect(report.falsePositives).toBeLessThanOrEqual(10)
  for (const difference of discrepancies) {
    await page
      .getByLabel(`Строка ${difference.row}, столбец ${difference.col}`, { exact: true })
      .fill(difference.expected ? String(difference.expected) : '')
  }
  await page.getByRole('button', { name: 'Я проверил(а) числа по фотографии', exact: true }).click()
  await expect(page.locator('.cell.uncertain')).toHaveCount(0)
  await page.getByRole('button', { name: 'Решить судоку', exact: true, includeHidden: true }).click()
  await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
})

test('requires fresh confirmation after edits and another photograph, and blocks conflicting numbers', async ({
  page,
}) => {
  await page.goto('./')
  const photo = await printedPhoto(page, 9)
  const upload = async () => {
    await page.getByLabel('Загрузить фотографию судоку').setInputFiles(photo)
    await expect(page.getByRole('button', { name: 'Распознать числа' })).toBeEnabled({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Распознать числа' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 })
  }
  await upload()
  const actions = page.getByRole('region', { name: 'Проверка и решение', exact: true })
  const confirm = actions.getByRole('button', { name: 'Я проверил(а) числа по фотографии', exact: true })
  const solve = actions.getByRole('button', { name: 'Решить судоку', exact: true, includeHidden: true })
  await confirm.click()
  await expect(solve).toBeEnabled()

  const firstCell = page.getByLabel('Строка 1, столбец 1', { exact: true })
  await firstCell.fill('')
  await expect(confirm).toBeEnabled()
  await expect(solve).toBeDisabled()
  await firstCell.fill('3')
  await expect(confirm).toBeEnabled()
  await expect(solve).toBeDisabled()
  await expect(actions.getByRole('status')).toContainText('Сначала исправьте числа, отмеченные красным')
  await confirm.click()
  await expect(actions.getByText('В исходных числах есть конфликт', { exact: true })).toBeVisible()
  await expect(confirm).toHaveCount(0)
  await expect(solve).toBeDisabled()
  await firstCell.fill('5')
  await expect(confirm).toBeEnabled()
  await expect(solve).toBeDisabled()
  await confirm.click()
  await expect(solve).toBeEnabled()

  await upload()
  await expect(confirm).toBeEnabled()
  await expect(solve).toBeDisabled()
  await chooseExample(page, 9)
  await expect(confirm).toHaveCount(0)
  await expect(solve).toBeEnabled()
  await menuAction(page, 'Ввести вручную')
  await expect(confirm).toHaveCount(0)
  await expect(solve).toBeDisabled()
})

test('cancels photo processing without replacing the next task', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/magazine16.png')
  await page.getByRole('button', { name: 'Закрыть обработку фотографии' }).click()
  await menuAction(page, 'Ввести вручную')
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).value === '')),
  ).toBe(true)
})

test('handles an OCR model loading failure and keeps manual entry available', async ({ page }) => {
  await page.context().route('**/vendor/tesseract/lang/**', (route) => route.abort())
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles(await printedPhoto(page, 9))
  await expect(page.getByRole('button', { name: 'Распознать числа' })).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Распознать числа' }).click()
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Закрыть обработку фотографии' }).click()
  await menuAction(page, 'Ввести вручную')
  await expect(page.getByLabel('Строка 1, столбец 3', { exact: true })).toBeEditable()
  await page.getByLabel('Строка 1, столбец 3', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Решить судоку', exact: true, includeHidden: true }),
  ).toBeEnabled()
})

test('corrects a rotated photograph before recognition', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles(await printedPhoto(page, 9, true))
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('button', { name: 'Повернуть', exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Повернуть', exact: true }).click()
  }
  await expect(page.getByRole('button', { name: 'Распознать числа' })).toBeEnabled()
  await page.getByRole('button', { name: 'Распознать числа' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60_000 })
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
  ).toEqual(getExample(9).givens)
})
