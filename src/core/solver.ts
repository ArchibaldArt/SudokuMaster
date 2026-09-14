import { topology } from './topology'
import type { PuzzleDefinition, SolveResult, SolverEvent, SolverStats } from './types'

export function unitsFor(size: number, boxSize: number): number[][] {
  return [
    ...Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => r * size + c)),
    ...Array.from({ length: size }, (_, c) => Array.from({ length: size }, (_, r) => r * size + c)),
    ...Array.from({ length: size }, (_, b) =>
      Array.from(
        { length: size },
        (_, k) =>
          (Math.floor(b / boxSize) * boxSize + Math.floor(k / boxSize)) * size +
          (b % boxSize) * boxSize +
          (k % boxSize),
      ),
    ),
  ]
}

export function validatePuzzle(puzzle: PuzzleDefinition): { valid: boolean; conflicts: number[] } {
  const { size, givens } = puzzle
  let geometry
  try {
    geometry = topology(puzzle)
  } catch {
    return { valid: false, conflicts: [] }
  }
  if (givens.length !== geometry.cells.length) return { valid: false, conflicts: [] }
  const conflicts = new Set<number>()
  givens.forEach((value, i) => {
    if (!Number.isInteger(value) || value < 0 || value > size) conflicts.add(i)
  })
  for (const unit of geometry.units) {
    const seen = new Map<number, number>()
    for (const index of unit) {
      const value = givens[index]
      if (!value) continue
      if (seen.has(value)) {
        conflicts.add(index)
        conflicts.add(seen.get(value)!)
      }
      seen.set(value, index)
    }
  }
  return { valid: conflicts.size === 0, conflicts: [...conflicts].sort((a, b) => a - b) }
}

const countBits = (n: number): number => {
  let count = 0
  for (; n; n &= n - 1) count++
  return count
}
const bitValue = (bit: number) => 32 - Math.clz32(bit)

/** A deterministic search whose event stream can be stopped between any two placements. */
export function* solvePuzzle(
  puzzle: PuzzleDefinition,
  stats: SolverStats,
): Generator<SolverEvent, SolveResult> {
  const validation = validatePuzzle(puzzle)
  if (!validation.valid) return { status: 'invalid', conflicts: validation.conflicts }
  const { size } = puzzle
  const board = [...puzzle.givens]
  const { units, cellUnits } = topology(puzzle)
  const unitMasks = new Int32Array(units.length)
  const all = (1 << size) - 1
  const trail: number[] = []
  const solutions: number[][] = []
  for (let i = 0; i < board.length; i++)
    if (board[i]) for (const u of cellUnits[i]) unitMasks[u] |= 1 << (board[i] - 1)
  const candidates = (i: number) => {
    let occupied = 0
    for (const u of cellUnits[i]) occupied |= unitMasks[u]
    return all & ~occupied
  }
  function place(
    index: number,
    value: number,
    kind: 'deduction' | 'guess',
    depth: number,
    reason: string,
  ): SolverEvent {
    board[index] = value
    const bit = 1 << (value - 1)
    for (const u of cellUnits[index]) unitMasks[u] |= bit
    trail.push(index)
    if (kind === 'guess') stats.guesses++
    else stats.deductions++
    return { type: 'change', index, value, kind, depth, reason }
  }
  function* undo(checkpoint: number, depth: number): Generator<SolverEvent> {
    while (trail.length > checkpoint) {
      const index = trail.pop()!
      const bit = 1 << (board[index] - 1)
      for (const u of cellUnits[index]) unitMasks[u] &= ~bit
      board[index] = 0
      yield {
        type: 'change',
        index,
        value: 0,
        kind: 'retract',
        depth,
        reason: 'Возвращаемся к предыдущей гипотезе',
      }
    }
  }
  function* search(depth: number): Generator<SolverEvent> {
    const checkpoint = trail.length
    while (true) {
      const masks = new Int32Array(board.length)
      let chosen = -1,
        fewest = size + 1,
        forced = -1
      for (let i = 0; i < board.length; i++)
        if (!board[i]) {
          masks[i] = candidates(i)
          const count = countBits(masks[i])
          if (!count) {
            stats.backtracks++
            yield* undo(checkpoint, depth)
            return
          }
          if (count === 1 && forced < 0) forced = i
          if (
            count < fewest ||
            (count === fewest && chosen >= 0 && cellUnits[i].length > cellUnits[chosen].length)
          ) {
            chosen = i
            fewest = count
          }
        }
      if (chosen < 0) {
        solutions.push([...board])
        if (solutions.length === 1) yield { type: 'solution', values: [...board] }
        yield* undo(checkpoint, depth)
        return
      }
      if (forced >= 0) {
        yield place(
          forced,
          bitValue(masks[forced]),
          'deduction',
          depth,
          'В клетке остался единственный кандидат',
        )
        continue
      }
      let branchPositions: number[] | null = null,
        branchValue = 0
      let hiddenIndex = -1,
        hiddenValue = 0
      for (const unit of units) {
        let occupied = 0
        for (const i of unit) if (board[i]) occupied |= 1 << (board[i] - 1)
        let missing = all & ~occupied
        while (missing) {
          const bit = missing & -missing
          missing &= ~bit
          const positions: number[] = []
          let where = -1,
            count = 0
          for (const i of unit)
            if (!board[i] && masks[i] & bit) {
              where = i
              positions.push(i)
              count++
            }
          if (!count) {
            stats.backtracks++
            yield* undo(checkpoint, depth)
            return
          }
          if (count > 1 && count < fewest) {
            fewest = count
            branchPositions = positions
            branchValue = bitValue(bit)
          }
          if (count === 1 && hiddenIndex < 0) {
            hiddenIndex = where
            hiddenValue = bitValue(bit)
          }
        }
      }
      if (hiddenIndex >= 0) {
        yield place(
          hiddenIndex,
          hiddenValue,
          'deduction',
          depth,
          'Единственное место для числа в строке, столбце или блоке',
        )
        continue
      }
      const branches: { index: number; value: number }[] = []
      if (branchPositions) for (const index of branchPositions) branches.push({ index, value: branchValue })
      else
        for (let options = masks[chosen]; options;) {
          const bit = options & -options
          options &= ~bit
          branches.push({ index: chosen, value: bitValue(bit) })
        }
      for (const { index, value } of branches) {
        const branch = trail.length
        yield place(index, value, 'guess', depth + 1, 'Проверяем один из возможных кандидатов')
        yield* search(depth + 1)
        if (solutions.length >= 2) return
        yield* undo(branch, depth)
      }
      yield* undo(checkpoint, depth)
      return
    }
  }
  yield* search(0)
  return solutions.length === 0
    ? { status: 'unsolvable' }
    : {
        status: solutions.length === 1 ? 'unique' : 'multiple',
        values: solutions[0],
      }
}
