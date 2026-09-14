import { test, expect } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import corpus from './fixtures/web/corpus.json' with { type: 'json' }
import type { CellRecognition } from '../src/core/types'

// Run explicitly: OCR_CORPUS=1 npm run test:e2e -- tests/ocr-corpus.spec.ts --project=desktop
// Evaluation never uses the solver or reference digits to change OCR output.
test.skip(!process.env.OCR_CORPUS, 'The 30-image benchmark is an explicit, slower check')
for (const fixture of corpus.filter((f) => !process.env.OCR_SPLIT || f.split === process.env.OCR_SPLIT)) {
  for (const mode of fixture.category === 'filled' || fixture.category === 'handwritten'
    ? (['all', 'printed'] as const)
    : (['all'] as const)) {
    test(`${fixture.id} / ${mode}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto('./')
      const base64 = (await readFile(`tests/fixtures/web/${fixture.image}`)).toString('base64')
      const result = await page.evaluate(
        async ({ base64, mode, filename }) => {
          const modulePath = '/src/services/photo.ts'
          const { PhotoProcessor, readPhoto } = await import(modulePath)
          const mime = filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
          const photo = await readPhoto(
            new File([await (await fetch(`data:${mime};base64,${base64}`)).blob()], filename, { type: mime }),
          )
          const processor = new PhotoProcessor()
          try {
            const start = performance.now()
            const detection = await processor.detect(photo)
            const recognized = await processor.recognize(
              photo,
              detection.corners,
              9,
              () => {},
              undefined,
              mode,
            )
            return {
              detected: detection.detected,
              suggestedSize: detection.suggestedSize,
              boards: detection.boards?.length ?? 1,
              corners: detection.corners,
              values: recognized.puzzle.givens,
              cells: recognized.cells.map(({ value, confidence, raw, needsReview }: CellRecognition) => ({
                value,
                confidence,
                raw,
                needsReview,
              })),
              elapsedMs: Math.round(performance.now() - start),
            }
          } catch (error) {
            return { error: String(error), values: Array(81).fill(0), cells: [] }
          } finally {
            processor.cancel()
          }
        },
        { base64, mode, filename: fixture.image },
      )
      const expected = fixture[mode]
      const differences = expected.flatMap((value, index) =>
        value === result.values[index] ? [] : [{ index, expected: value, actual: result.values[index] }],
      )
      const report = {
        id: fixture.id,
        mode,
        split: fixture.split,
        category: fixture.category,
        expectedDigits: expected.filter(Boolean).length,
        correctDigits: expected.filter((v, i) => v && result.values[i] === v).length,
        missed: differences.filter((d) => d.expected && !d.actual).length,
        wrong: differences.filter((d) => d.expected && d.actual).length,
        extra: differences.filter((d) => !d.expected).length,
        differences,
        ...result,
      }
      const folder = `/tmp/sudoku-ocr-${process.env.OCR_RUN || 'current'}`
      await mkdir(folder, { recursive: true })
      await writeFile(`${folder}/${fixture.id}-${mode}.json`, JSON.stringify(report, null, 2))
      console.log(
        JSON.stringify({
          id: report.id,
          mode,
          errors: differences.length,
          correct: report.correctDigits,
          expected: report.expectedDigits,
          extra: report.extra,
          failure: result.error,
        }),
      )
      expect(result.values).toHaveLength(81)
      expect(result.error).toBeUndefined()
      const limits = fixture.limits[mode]
      if (!limits) throw new Error(`Missing OCR regression limits for ${fixture.id} / ${mode}`)
      expect(differences.length, `${fixture.id}: changed cells`).toBeLessThanOrEqual(limits.maxErrors)
      expect(report.extra, `${fixture.id}: false positive digits`).toBeLessThanOrEqual(limits.maxExtra)
      expect(report.correctDigits, `${fixture.id}: preserved digits`).toBeGreaterThanOrEqual(
        limits.minCorrect,
      )
    })
  }
}
