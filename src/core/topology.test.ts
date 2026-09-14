import { expect, it } from 'vitest'
import { compositeExample } from '../data/composite'
import { getExample } from '../data/examples'
import { emptyLayout, layouts, topology } from './topology'
import { solvePuzzle, validatePuzzle } from './solver'
import type { PuzzleDefinition, SolverEvent } from './types'
import magazine from '../../tests/fixtures/composite8-givens.json' with { type: 'json' }

function solve(puzzle: PuzzleDefinition, onEvent?: (event: SolverEvent) => void) {
  const iterator = solvePuzzle(puzzle, { guesses: 0, deductions: 0, backtracks: 0, elapsedMs: 0 })
  for (let i = 0; i < 1_000_000; i++) {
    const next = iterator.next()
    if (next.done) return next.value
    onEvent?.(next.value)
  }
  throw new Error('Search budget exceeded')
}
function checkEveryBoard(puzzle: PuzzleDefinition, values: number[]) {
  for (const board of topology(puzzle).boards) {
    const local = board.cells.map((i) => values[i])
    // Independent verification using local coordinates, including all shared values.
    for (let i = 0; i < 9; i++) {
      expect(new Set(local.slice(i * 9, i * 9 + 9)).size).toBe(9)
      expect(new Set(Array.from({ length: 9 }, (_, r) => local[r * 9 + i])).size).toBe(9)
      expect(
        new Set(
          Array.from(
            { length: 9 },
            (_, k) => local[(Math.floor(i / 3) * 3 + Math.floor(k / 3)) * 9 + (i % 3) * 3 + (k % 3)],
          ),
        ).size,
      ).toBe(9)
    }
  }
  puzzle.givens.forEach((v, i) => {
    if (v) expect(values[i]).toBe(v)
  })
}
it.each([
  ['twin', 153],
  ['samurai', 369],
  ['eight', 576],
] as const)('solves %s with %i canonical cells and valid overlapping boards', (name, count) => {
  const puzzle = compositeExample(name),
    geometry = topology(puzzle)
  expect(geometry.cells).toHaveLength(count)
  const result = solve(puzzle)
  expect(result.status).toBe('unique')
  checkEveryBoard(puzzle, result.values!)
  if (name === 'eight') expect([geometry.width, geometry.height]).toEqual([21, 33])
})
it('rejects disconnected, duplicated, fractional and partially aligned layouts', () => {
  for (const origin of [
    { x: 12, y: 12 },
    { x: 0, y: 0 },
    { x: 6.5, y: 6 },
    { x: 1, y: 1 },
  ]) {
    expect(() => emptyLayout([{ x: 0, y: 0 }, origin])).toThrow()
  }
})
it('propagates constraints across shared cells and detects an impossible combination', () => {
  const puzzle = emptyLayout(layouts.twin.boards),
    geometry = topology(puzzle)
  getExample(9).givens.forEach((v, i) => {
    puzzle.givens[geometry.boards[0].cells[i]] = v
  })
  // The first board forces 4 in its r7c9; the second board's first row forbids it.
  puzzle.givens[geometry.boards[1].cells[3]] = 4
  expect(validatePuzzle(puzzle).valid).toBe(true)
  expect(solve(puzzle).status).toBe('unsolvable')
})
it('keeps the event stream legal during guessing and backtracking on an empty linked puzzle', () => {
  const puzzle = emptyLayout(layouts.twin.boards),
    visible = [...puzzle.givens]
  let retracted = 0
  const result = solve(puzzle, (event) => {
    if (event.type === 'change') {
      visible[event.index] = event.value
      if (event.kind === 'retract') retracted++
      expect(validatePuzzle({ ...puzzle, givens: visible }).valid).toBe(true)
    }
  })
  expect(result.status).toBe('multiple')
  expect(retracted).toBeGreaterThan(0)
  checkEveryBoard(puzzle, result.values!)
})

it('solves the manually transcribed eight-board magazine puzzle', () => {
  const puzzle = emptyLayout(layouts.eight.boards),
    t = topology(puzzle)
  magazine.forEach((rows, b) =>
    rows
      .join('')
      .split('')
      .forEach((digit, i) => {
        if (Number(digit)) puzzle.givens[t.boards[b].cells[i]] = Number(digit)
      }),
  )
  expect(validatePuzzle(puzzle).valid).toBe(true)
  const start = performance.now(),
    result = solve(puzzle)
  // Independently checked with exact cover: the printed givens admit two completions.
  expect(result.status).toBe('multiple')
  checkEveryBoard(puzzle, result.values!)
  expect(performance.now() - start).toBeLessThan(15_000)
}, 20_000)
