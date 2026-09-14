import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

// Exact upstream revisions and checksums live in the manifest. Never fetch test
// data at runtime in the application; these images stay outside the site bundle.
const root = new URL('../tests/fixtures/web/', import.meta.url)
const corpus = JSON.parse(await readFile(new URL('corpus.json', root), 'utf8'))
const hash = (data) => createHash('sha256').update(data).digest('hex')
for (const fixture of corpus) {
  const target = new URL(fixture.image, root)
  try {
    if (hash(await readFile(target)) === fixture.sha256) continue
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const response = await fetch(fixture.url)
  if (!response.ok) throw new Error(`${fixture.id}: HTTP ${response.status}`)
  const data = Buffer.from(await response.arrayBuffer())
  if (hash(data) !== fixture.sha256) throw new Error(`${fixture.id}: checksum mismatch`)
  await writeFile(target, data)
  console.log(`Downloaded ${fixture.id}`)
}
console.log(`Verified ${corpus.length} images`)
