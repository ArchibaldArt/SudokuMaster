import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { curvedPhoto } from './curved-photo'

for (const size of [9, 16] as const) {
  for (const variant of ['curved', 'missing separator', 'flat'] as const) {
    test(`uses local ${Math.sqrt(size)}×${Math.sqrt(size)} blocks for a ${variant} ${size}×${size} photo`, async ({
      page,
    }, info) => {
      test.setTimeout(120000)
      await page.goto('./')
      const fixture = await curvedPhoto(
        page,
        size,
        variant === 'flat' ? 0 : 0.38,
        variant === 'missing separator',
      )
      const recognize = async () =>
        page.evaluate(
          async ({ fixture, size }) => {
            const path = '/src/services/photo.ts'
            const { PhotoProcessor, readPhoto } = await import(path)
            const source = await readPhoto(
              new File([await (await fetch(fixture.url)).blob()], 'curved.png', { type: 'image/png' }),
            )
            const processor = new PhotoProcessor()
            try {
              const result = await processor.recognize(source, fixture.corners, size, () => {})
              return { values: result.puzzle.givens, photo: result.imageUrl, photos: result.photos }
            } finally {
              processor.cancel()
            }
          },
          { fixture, size },
        )
      const result = await recognize()
      const differences = fixture.values.flatMap((v, i) =>
        v !== result.values[i] ? [{ i, expected: v, actual: result.values[i] }] : [],
      )
      console.log('Local geometry OCR:', size, variant, differences)
      await writeFile(info.outputPath('curved-photo.png'), Buffer.from(fixture.url.split(',')[1], 'base64'))
      await writeFile(
        info.outputPath('rectified-photo.jpg'),
        Buffer.from(result.photo.split(',')[1], 'base64'),
      )
      expect(result.values).toEqual(fixture.values)
      // Photo/grid comparison consumes the same corrected image and full-cell bounds.
      expect(result.photos[0].imageUrl).toBe(result.photo)
      expect(result.photos[0].rects).toHaveLength(size * size)
    })
  }
}
