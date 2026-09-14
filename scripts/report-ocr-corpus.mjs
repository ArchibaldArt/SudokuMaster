import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [resultsFolder, output] = process.argv.slice(2)
if (!resultsFolder) throw new Error('Usage: node scripts/report-ocr-corpus.mjs RESULTS_FOLDER [OUTPUT.json]')
const corpus = JSON.parse(
  await readFile(new URL('../tests/fixtures/web/corpus.json', import.meta.url), 'utf8'),
)
const rows = []
for (const fixture of corpus) {
  for (const mode of ['all', 'printed']) {
    let result
    try {
      result = JSON.parse(await readFile(resolve(resultsFolder, `${fixture.id}-${mode}.json`), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    // Recompute using the reviewed annotations, including documented corrections
    // to mismatched upstream empty/filled pairs. Baseline OCR pixels stay intact.
    const expected = fixture[mode]
    const differences = expected.flatMap((v, index) =>
      v === result.values[index] ? [] : [{ index, expected: v, actual: result.values[index] }],
    )
    rows.push({
      id: fixture.id,
      mode,
      split: fixture.split,
      category: fixture.category,
      digits: expected.filter(Boolean).length,
      correct: expected.filter((v, i) => v && result.values[i] === v).length,
      missed: differences.filter((d) => d.expected && !d.actual).length,
      wrong: differences.filter((d) => d.expected && d.actual).length,
      extra: differences.filter((d) => !d.expected).length,
      errors: differences.length,
      detected: result.detected,
      suggestedSize: result.suggestedSize,
      elapsedMs: result.elapsedMs,
      failure: result.error,
      differences,
    })
  }
}
const sum = (data, key) => data.reduce((n, r) => n + (r[key] || 0), 0)
const groups = []
for (const split of ['tune', 'test', 'all'])
  for (const mode of ['all', 'printed']) {
    const data = rows.filter((r) => r.mode === mode && (split === 'all' || r.split === split))
    if (!data.length) continue
    groups.push({
      split,
      mode,
      images: data.length,
      exact: data.filter((r) => !r.errors && !r.failure).length,
      digits: sum(data, 'digits'),
      correct: sum(data, 'correct'),
      missed: sum(data, 'missed'),
      wrong: sum(data, 'wrong'),
      extra: sum(data, 'extra'),
      errors: sum(data, 'errors'),
    })
  }
if (output) await writeFile(output, JSON.stringify({ groups, images: rows }, null, 2) + '\n')
console.table(groups)
