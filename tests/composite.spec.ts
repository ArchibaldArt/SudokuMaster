import { test, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { compositeExample } from '../src/data/composite'
import { emptyLayout, layouts, topology } from '../src/core/topology'
import type { LayoutName } from '../src/core/topology'
import magazine from './fixtures/composite8-givens.json' with { type: 'json' }

async function samplePhoto(page: import('@playwright/test').Page, name: LayoutName) {
  const puzzle = compositeExample(name),
    t = topology(puzzle)
  const data = await page.evaluate(
    ({ puzzle, cells, width, height }) => {
      const cell = 55,
        margin = 55,
        canvas = document.createElement('canvas')
      canvas.width = width * cell + margin * 2
      canvas.height = height * cell + margin * 2
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (const { x, y } of cells) {
        for (const [ex, ey, dx, dy] of [
          [x, y, 1, 0],
          [x, y + 1, 1, 0],
          [x, y, 0, 1],
          [x + 1, y, 0, 1],
        ]) {
          ctx.lineWidth = (dx ? ey : ex) % 3 === 0 ? 3 : 1
          ctx.strokeStyle = '#111'
          ctx.beginPath()
          ctx.moveTo(margin + ex * cell, margin + ey * cell)
          ctx.lineTo(margin + (ex + dx) * cell, margin + (ey + dy) * cell)
          ctx.stroke()
        }
      }
      ctx.fillStyle = '#111'
      ctx.font = 'bold 29px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      cells.forEach(({ x, y }, i) => {
        if (puzzle.givens[i])
          ctx.fillText(String(puzzle.givens[i]), margin + (x + 0.5) * cell, margin + (y + 0.5) * cell)
      })
      return canvas.toDataURL('image/png')
    },
    { puzzle, cells: t.cells, width: t.width, height: t.height },
  )
  return { name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(data.split(',')[1], 'base64') }
}

test('detects all eight boards on the annotated magazine photograph', async ({ page }) => {
  await page.goto('./')
  const base64 = (await readFile('tests/fixtures/composite8.png')).toString('base64')
  const detection = await page.evaluate(async (base64) => {
    const path = '/src/services/photo.ts'
    const { PhotoProcessor, readPhoto } = await import(path)
    const processor = new PhotoProcessor()
    try {
      return await processor.detect(
        await readPhoto(
          new File([await (await fetch(`data:image/png;base64,${base64}`)).blob()], 'photo.png', {
            type: 'image/png',
          }),
        ),
      )
    } finally {
      processor.cancel()
    }
  }, base64)
  expect(detection.boards).toHaveLength(8)
  expect(detection.boards.map((b: { x: number; y: number }) => [b.x, b.y])).toEqual([
    [0, 0],
    [12, 0],
    [6, 6],
    [0, 12],
    [12, 12],
    [6, 18],
    [0, 24],
    [12, 24],
  ])
})

for (const name of ['twin', 'samurai', 'eight'] as const)
  test(`detects generated ${name} geometry`, async ({ page }) => {
    await page.goto('./')
    const photo = await samplePhoto(page, name)
    const detection = await page.evaluate(async (base64) => {
      const path = '/src/services/photo.ts'
      const { PhotoProcessor, readPhoto } = await import(path),
        processor = new PhotoProcessor()
      try {
        return await processor.detect(
          await readPhoto(
            new File([await (await fetch(`data:image/png;base64,${base64}`)).blob()], 'photo.png', {
              type: 'image/png',
            }),
          ),
        )
      } finally {
        processor.cancel()
      }
    }, photo.buffer.toString('base64'))
    expect(detection.boards).toHaveLength(compositeExample(name).boards!.length)
  })

for (const name of ['twin', 'samurai', 'eight'] as const)
  test(`recognizes, confirms, solves and exports ${name}`, async ({ page, baseURL }, info) => {
    test.setTimeout(120_000)
    const external: string[] = []
    page.on('request', (r) => {
      if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(baseURL!).origin)
        external.push(r.url())
    })
    await page.goto('./')
    const photo = await samplePhoto(page, name)
    await page.getByLabel('Загрузить фотографию судоку').setInputFiles(photo)
    const recognize = page.getByRole('button', { name: 'Схема верна — распознать числа', exact: true })
    await expect(recognize).toBeEnabled({ timeout: 30_000 })
    await expect(page.locator('[data-photo-board]')).toHaveCount(layouts[name].boards.length)
    await recognize.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 90_000 })
    await page.getByLabel('Выбрать поле', { exact: true }).selectOption('all')
    const values = () =>
      page
        .locator('.cell input')
        .evaluateAll((inputs) => inputs.map((el) => Number((el as HTMLInputElement).value)))
    expect(await values()).toEqual(compositeExample(name).givens)
    const solve = page.getByRole('button', { name: 'Решить судоку', exact: true })
    await expect(solve).toBeDisabled()
    await page.getByRole('button', { name: 'Я проверил(а) числа по фотографии' }).click()
    await solve.click()
    await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible({ timeout: 30_000 })
    expect((await values()).every(Boolean)).toBe(true)
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Сохранить решение', exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe(`SudokuMaster-${layouts[name].boards.length}-fields.png`)
    await download.saveAs(info.outputPath(`${name}-solution.png`))
    if (name === 'eight')
      await page.screenshot({ path: info.outputPath('eight-workspace.png'), fullPage: true })
    expect(external).toEqual([])
  })

test('reviews and solves the real magazine photo after correcting OCR discrepancies', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await page.goto('./')
  await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/composite8.png')
  const recognize = page.getByRole('button', { name: 'Схема верна — распознать числа', exact: true })
  await expect(recognize).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('dialog').screenshot({ path: info.outputPath('magazine-layout.png') })
  await recognize.click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 90_000 })
  await page.getByLabel('Выбрать поле', { exact: true }).selectOption('all')
  const puzzle = emptyLayout(layouts.eight.boards),
    t = topology(puzzle)
  magazine.forEach((rows, b) =>
    rows
      .join('')
      .split('')
      .forEach((n, i) => {
        if (Number(n)) puzzle.givens[t.boards[b].cells[i]] = Number(n)
      }),
  )
  const recognized = await page
    .locator('.cell input')
    .evaluateAll((inputs) => inputs.map((el) => Number((el as HTMLInputElement).value)))
  const differences = puzzle.givens.flatMap((v, i) =>
    v !== recognized[i]
      ? [{ index: i, x: t.cells[i].x, y: t.cells[i].y, expected: v, actual: recognized[i] }]
      : [],
  )
  console.log(
    `Magazine OCR: ${differences.length} corrections, ${puzzle.givens.filter(Boolean).length} printed givens`,
  )
  await writeFile(info.outputPath('ocr-differences.json'), JSON.stringify(differences, null, 2))
  for (const diff of differences)
    await page
      .locator(`[data-cell-id="${diff.index}"] input`)
      .fill(diff.expected ? String(diff.expected) : '')
  await page.getByRole('button', { name: 'Я проверил(а) числа по фотографии' }).click()
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Есть несколько решений', { exact: true })).toBeVisible({ timeout: 30_000 })
})
