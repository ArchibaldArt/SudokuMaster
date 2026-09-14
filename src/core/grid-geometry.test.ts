import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import type { Point } from './types'

interface Mesh {
  nodes: Point[]
  blocks: { row: number; col: number; corners: Point[] }[]
  corrected: boolean
  support: number
}
// Exercise the same dependency-free geometry code imported by the classic worker.
const mesh: (mask: Uint8Array, w: number, h: number, xs: number[], ys: number[], box: number) => Mesh =
  runInNewContext(
    readFileSync(new URL('../../public/grid-geometry.js', import.meta.url), 'utf8') + '\nlocalGridMesh',
  )

for (const size of [9, 16]) {
  for (const offset of [0, 0.22]) {
    it(`locates shared block/cell vertices on a bowed ${size}×${size} grid with ${offset} seed offset`, () => {
      const pitch = 32,
        margin = 20,
        side = size * pitch,
        extent = side + margin * 2
      const mask = new Uint8Array(extent * extent)
      const point = (u: number, v: number) => ({
        x: margin + u + pitch * 0.38 * Math.sin((2 * Math.PI * v) / side),
        y: margin + v + pitch * 0.285 * Math.sin((Math.PI * u) / side),
      })
      for (let line = 0; line <= size; line++)
        for (let t = 0; t <= side; t += 0.5) {
          for (const p of [point(line * pitch, t), point(t, line * pitch)]) {
            const radius = line % Math.sqrt(size) === 0 ? 1 : 0
            for (let dx = -radius; dx <= radius; dx++)
              for (let dy = -radius; dy <= radius; dy++)
                mask[(Math.round(p.y) + dy) * extent + Math.round(p.x) + dx] = 255
          }
        }
      const seeds = Array.from({ length: size + 1 }, (_, i) => margin + i * pitch)
      // Projection peaks on a curled sheet need not agree with the positions of
      // separators at the outer edges. They are only starting estimates.
      const ys = seeds.map((value, i) => value + (i > 0 && i < size ? pitch * offset : 0))
      const result = mesh(mask, extent, extent, seeds, ys, Math.sqrt(size))
      expect(result.corrected).toBe(true)
      expect(result.blocks).toHaveLength(size)
      for (let row = 0; row <= size; row++)
        for (let col = 0; col <= size; col++) {
          const actual = result.nodes[row * (size + 1) + col],
            expected = point(col * pitch, row * pitch)
          expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(pitch * 0.16)
        }
      for (let i = 1; i < Math.sqrt(size); i++) {
        expect(result.blocks[i - 1].corners[1]).toBe(result.blocks[i].corners[0])
        expect(result.blocks[i - 1].corners[2]).toBe(result.blocks[i].corners[3])
      }
    })
  }
}

it('keeps the original geometry when a grid cannot be supported by image evidence', () => {
  const size = 9,
    pitch = 20,
    extent = 200
  const seeds = Array.from({ length: size + 1 }, (_, i) => 10 + i * pitch)
  const result = mesh(new Uint8Array(extent * extent), extent, extent, seeds, seeds, 3)
  expect(result.corrected).toBe(false)
  expect(result.support).toBe(0)
  for (let row = 0; row <= size; row++)
    for (let col = 0; col <= size; col++)
      expect(result.nodes[row * (size + 1) + col]).toEqual({ x: seeds[col], y: seeds[row] })
})
