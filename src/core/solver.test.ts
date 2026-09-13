import { describe, expect, it } from 'vitest'
import { getExample } from '../data/examples'
import { emptyPuzzle } from './types'
import type { PuzzleDefinition, SolverEvent, SolverStats } from './types'
import { solvePuzzle, unitsFor, validatePuzzle } from './solver'

const stats = (): SolverStats => ({ guesses: 0, deductions: 0, backtracks: 0, elapsedMs: 0 })
function run(puzzle: PuzzleDefinition, onEvent?: (event: SolverEvent) => void) {
  const counters = stats(),
    iterator = solvePuzzle(puzzle, counters)
  for (let i = 0; i < 5_000_000; i++) {
    const next = iterator.next()
    if (next.done) return { result: next.value, counters }
    onEvent?.(next.value)
  }
  throw new Error('Solver did not terminate within the test budget')
}
function assertSolution(puzzle: PuzzleDefinition, values: number[]) {
  expect(validatePuzzle({ ...puzzle, givens: values }).valid).toBe(true)
  for (const unit of unitsFor(puzzle.size, puzzle.boxSize)) {
    expect(unit.map((i) => values[i]).sort((a, b) => a - b)).toEqual(
      Array.from({ length: puzzle.size }, (_, i) => i + 1),
    )
  }
  puzzle.givens.forEach((value, i) => {
    if (value) expect(values[i]).toBe(value)
  })
}

describe('classic solver', () => {
  it.each([9, 16] as const)(
    'solves the %i×%i example, proves uniqueness, and preserves every given',
    (size) => {
      const puzzle = getExample(size)
      const firstSolution: number[][] = []
      const { result } = run(puzzle, (event) => {
        if (event.type === 'solution') firstSolution.push(event.values)
      })
      expect(result.status).toBe('unique')
      expect(firstSolution).toHaveLength(1)
      expect(result.values).toEqual(firstSolution[0])
      assertSolution(puzzle, result.values!)
    },
    15_000,
  )

  it('keeps every intermediate board legal and retracts dependent deductions on a hard puzzle', () => {
    const puzzle: PuzzleDefinition = {
      size: 9,
      boxSize: 3,
      givens: '100007090030020008009600500005300900010080002600004000300000010040000007007000300'
        .split('')
        .map(Number),
    }
    const visible = [...puzzle.givens]
    let changes = 0,
      reversals = 0
    const { result, counters } = run(puzzle, (event) => {
      if (event.type === 'change') {
        expect(puzzle.givens[event.index]).toBe(0)
        visible[event.index] = event.value
        changes++
        if (event.kind === 'retract') reversals++
        expect(validatePuzzle({ ...puzzle, givens: visible }).valid).toBe(true)
      } else expect(event.values).toEqual(visible)
    })
    expect(result.status).toBe('unique')
    expect(counters.guesses).toBeGreaterThan(0)
    expect(counters.backtracks).toBeGreaterThan(0)
    expect(reversals).toBeGreaterThan(0)
    expect(changes).toBeGreaterThan(50)
    assertSolution(puzzle, result.values!)
  })

  it('distinguishes local conflicts from a valid-looking but impossible puzzle', () => {
    const conflicting = getExample(9)
    conflicting.givens[2] = 5
    const invalid = run(conflicting).result
    expect(invalid.status).toBe('invalid')
    expect(invalid.conflicts).toContain(0)
    expect(invalid.conflicts).toContain(2)
    const impossible = getExample(9)
    impossible.givens[2] = 1
    expect(validatePuzzle(impossible).valid).toBe(true)
    expect(run(impossible).result.status).toBe('unsolvable')
  })

  it('finds two distinct completions without claiming uniqueness for an empty grid', () => {
    const puzzle = emptyPuzzle(9),
      { result } = run(puzzle)
    expect(result.status).toBe('multiple')
    assertSolution(puzzle, result.values!)
  })

  it('rejects wrong sizes, out-of-range values, fractions and NaN', () => {
    for (const bad of [17, -1, 1.5, NaN]) {
      const puzzle = getExample(16)
      puzzle.givens[1] = bad
      expect(run(puzzle).result.status).toBe('invalid')
    }
    expect(run({ ...getExample(9), givens: [1] }).result.status).toBe('invalid')
  })
})
