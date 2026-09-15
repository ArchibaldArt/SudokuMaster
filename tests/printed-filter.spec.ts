import { test, expect } from '@playwright/test'
import { getExample } from '../src/data/examples'
import { printedPhoto } from './printed-photo'
import type { CellRecognition } from '../src/core/types'
import corpus from './fixtures/web/corpus.json' with { type: 'json' }
import newspaper from './fixtures/newspaper9-givens.json' with { type: 'json' }

type CellCheck = Pick<CellRecognition, 'value' | 'needsReview'>

for (const size of [9, 16] as const) {
  test(`preserves a fully printed ${size}×${size} grid without treating thin font strokes as handwriting`, async ({
    page,
  }) => {
    await page.goto('./')
    const box = Math.sqrt(size)
    const expected = Array.from({ length: size * size }, (_, i) => {
      const row = Math.floor(i / size),
        col = i % size
      return ((row * box + Math.floor(row / box) + col) % size) + 1
    })
    await page
      .getByLabel('Загрузить фотографию судоку')
      .setInputFiles(await printedPhoto(page, size, false, expected))
    const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
    await expect(recognize).toBeEnabled({ timeout: 30000 })
    await page.getByRole('radio', { name: 'Только печатные', exact: true }).check()
    await recognize.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 })
    expect(
      await page
        .locator('.cell input')
        .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
    ).toEqual(expected)
  })
  test(`preserves the ordinary, smaller printed font in ${size}×${size} filtered mode`, async ({ page }) => {
    await page.goto('./')
    await page.getByLabel('Загрузить фотографию судоку').setInputFiles(await printedPhoto(page, size))
    const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
    await expect(recognize).toBeEnabled({ timeout: 30000 })
    await page.getByRole('radio', { name: 'Только печатные', exact: true }).check()
    await recognize.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 })
    expect(
      await page
        .locator('.cell input')
        .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
    ).toEqual(getExample(size).givens)
  })
  test(`keeps black ${size}×${size} print with colour noise and excludes notes and frame remnants`, async ({
    page,
  }) => {
    await page.goto('./')
    const expected = getExample(size).givens
    const result = await page.evaluate(
      async ({ size, expected }) => {
        const pitch = 100,
          margin = 80,
          side = size * pitch,
          extent = side + margin * 2
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = extent
        const ctx = canvas.getContext('2d')!
        const paper = ctx.createLinearGradient(0, 0, extent, extent)
        paper.addColorStop(0, '#e0ddd1')
        paper.addColorStop(1, '#b9b6ab')
        ctx.fillStyle = paper
        ctx.fillRect(0, 0, extent, extent)
        for (let i = 0; i <= size; i++) {
          ctx.strokeStyle = '#171715'
          ctx.lineWidth = i % Math.sqrt(size) === 0 ? 18 : 3
          ctx.beginPath()
          ctx.moveTo(margin + i * pitch, margin)
          ctx.lineTo(margin + i * pitch, margin + side)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(margin, margin + i * pitch)
          ctx.lineTo(margin + side, margin + i * pitch)
          ctx.stroke()
        }
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        expected.forEach((value, index) => {
          const x = margin + ((index % size) + 0.5) * pitch
          const y = margin + (Math.floor(index / size) + 0.5) * pitch
          if (value) {
            ctx.fillStyle = '#151513'
            ctx.font = '68px Arial'
            ctx.fillText(String(value), x, y)
            // A camera/JPEG colour cast across a black stroke must not cut the
            // digit into fragments, even though each tinted pixel looks blue.
            const strip = ctx.getImageData(x - 42, y - 8, 84, 8)
            for (let p = 0; p < strip.data.length; p += 4) {
              if (strip.data[p] < 60) {
                strip.data[p] = 42
                strip.data[p + 1] = 53
                strip.data[p + 2] = 64
              }
            }
            ctx.putImageData(strip, x - 42, y - 8)
          } else if (index % 3 === 0) {
            ctx.fillStyle = '#181817'
            ctx.font = 'bold 36px Arial'
            ctx.fillText('3', x, y)
          } else if (index % 3 === 1) {
            ctx.fillStyle = '#245dba'
            ctx.font = '68px Arial'
            ctx.fillText('7', x, y)
          }
        })
        const path = '/src/services/photo.ts'
        const { PhotoProcessor, readPhoto } = await import(path)
        const source = await readPhoto(
          new File([await (await fetch(canvas.toDataURL())).blob()], 'notes.png', { type: 'image/png' }),
        )
        const processor = new PhotoProcessor()
        try {
          const corners = [
            { x: margin, y: margin },
            { x: margin + side, y: margin },
            { x: margin + side, y: margin + side },
            { x: margin, y: margin + side },
          ]
          const result = await processor.recognize(source, corners, size, () => {}, undefined, 'printed')
          return {
            values: result.puzzle.givens,
            cells: result.cells.map((cell: CellCheck) => ({
              value: cell.value,
              needsReview: cell.needsReview,
            })),
          }
        } finally {
          processor.cancel()
        }
      },
      { size, expected },
    )
    expect(result.values).toEqual(expected)
    expect(
      result.cells.flatMap((cell: CellCheck, index: number) =>
        !expected[index] && cell.needsReview ? [index] : [],
      ),
    ).toEqual([])
  })
}

for (const height of [2200, 1600]) {
  test(`recognizes the supplied filled newspaper with taller pen strokes at height ${height}`, async ({
    page,
  }, info) => {
    await page.goto('./')
    const file = await page.evaluate(async (height) => {
      const image = new Image()
      image.src = '/tests/fixtures/newspaper9.png'
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.height = height
      canvas.width = Math.round((height * image.width) / image.height)
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png').split(',')[1]
    }, height)
    await page
      .getByLabel('Загрузить фотографию судоку')
      .setInputFiles({ name: 'newspaper9.png', mimeType: 'image/png', buffer: Buffer.from(file, 'base64') })
    const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
    await expect(recognize).toBeEnabled({ timeout: 30000 })
    await expect(page.getByRole('dialog').getByRole('combobox')).toHaveValue('9')
    await page.getByRole('radio', { name: 'Только печатные', exact: true }).check()
    await recognize.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 })
    expect(
      await page
        .locator('.cell input')
        .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
    ).toEqual(newspaper.flat())
    await page.screenshot({ path: info.outputPath(`newspaper-${height}.png`), fullPage: true })
  })
}

test('keeps missed printed numbers marked while reducing false empty-cell alerts on the magazine photo', async ({
  page,
}, info) => {
  await page.goto('./')
  const result = await page.evaluate(async () => {
    const path = '/src/services/photo.ts'
    const { PhotoProcessor, readPhoto } = await import(path)
    const source = await readPhoto(
      new File([await (await fetch('/tests/fixtures/magazine16.png')).blob()], 'photo.png', {
        type: 'image/png',
      }),
    )
    const processor = new PhotoProcessor()
    try {
      const { corners } = await processor.detect(source)
      const result = await processor.recognize(source, corners, 16, () => {}, undefined, 'printed')
      return result.cells.map((cell: CellCheck) => ({ value: cell.value, needsReview: cell.needsReview }))
    } finally {
      processor.cancel()
    }
  })
  const expected = getExample(16).givens
  const summary = {
    preserved: result.filter(
      (cell: CellCheck, index: number) => expected[index] && cell.value === expected[index],
    ).length,
    extras: result.filter((cell: CellCheck, index: number) => !expected[index] && cell.value).length,
    emptyAlerts: result.filter(
      (cell: CellCheck, index: number) => !expected[index] && !cell.value && cell.needsReview,
    ).length,
    silentlyMissed: result.flatMap((cell: CellCheck, index: number) =>
      expected[index] && !cell.value && !cell.needsReview ? [index] : [],
    ),
  }
  console.log('Printed filter:', summary)
  await info.attach('printed-filter.json', { body: JSON.stringify(summary), contentType: 'application/json' })
  expect(summary.preserved).toBeGreaterThanOrEqual(103)
  expect(summary.extras).toBe(0)
  expect(summary.emptyAlerts).toBeLessThanOrEqual(30)
  expect(summary.silentlyMissed).toEqual([])
  expect(result[13]).toEqual({ value: 0, needsReview: false })
  // The supplied photograph is the fixture itself (same SHA-256). These three
  // printed numbers used to be fragmented by the colour filter and become empty.
  expect([result[191].value, result[207].value, result[222].value]).toEqual([5, 16, 2])
})

for (const id of ['filled_0019', 'filled_0032']) {
  test(`retains review alerts for faded or partly lost newspaper print in ${id}`, async ({ page }) => {
    await page.goto('./')
    const result = await page.evaluate(async (id) => {
      const path = '/src/services/photo.ts'
      const { PhotoProcessor, readPhoto } = await import(path)
      const source = await readPhoto(
        new File([await (await fetch(`/tests/fixtures/web/${id}.jpg`)).blob()], 'photo.jpg', {
          type: 'image/jpeg',
        }),
      )
      const processor = new PhotoProcessor()
      try {
        const { corners } = await processor.detect(source)
        const result = await processor.recognize(source, corners, 9, () => {}, undefined, 'printed')
        return result.cells.map((cell: CellCheck) => ({ value: cell.value, needsReview: cell.needsReview }))
      } finally {
        processor.cancel()
      }
    }, id)
    const expected = corpus.find((f) => f.id === id)!.printed
    expect(
      result.flatMap((cell: CellCheck, index: number) =>
        expected[index] && !cell.value && !cell.needsReview ? [index] : [],
      ),
    ).toEqual([])
  })
}
