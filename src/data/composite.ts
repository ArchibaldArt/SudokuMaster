import { emptyLayout, layouts } from '../core/topology'
import type { LayoutName } from '../core/topology'
import { topology } from '../core/topology'

/** Deterministic examples built on a globally compatible Latin pattern. */
export function compositeExample(layout: LayoutName) {
  const puzzle = emptyLayout(layouts[layout].boards)
  puzzle.givens = topology(puzzle).cells.map(({ x, y }) =>
    (x * 7 + y * 11) % 5 < 2 ? 0 : ((x + (y % 3) * 3 + Math.floor(y / 3)) % 9) + 1,
  )
  return puzzle
}
