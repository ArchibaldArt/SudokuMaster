import type { GridPlacement, PuzzleDefinition } from './types'

export type LayoutName = 'twin' | 'samurai' | 'eight'
export const layouts: Record<LayoutName, { name: string; boards: GridPlacement[] }> = {
  twin: {
    name: 'Два связанных поля',
    boards: [
      { x: 0, y: 0 },
      { x: 6, y: 6 },
    ],
  },
  samurai: {
    name: 'Самурай · 5 полей',
    boards: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 6, y: 6 },
      { x: 0, y: 12 },
      { x: 12, y: 12 },
    ],
  },
  eight: {
    name: 'Составное · 8 полей',
    boards: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 6, y: 6 },
      { x: 0, y: 12 },
      { x: 12, y: 12 },
      { x: 6, y: 18 },
      { x: 0, y: 24 },
      { x: 12, y: 24 },
    ],
  },
}
export interface Topology {
  width: number
  height: number
  cells: { x: number; y: number; boards: number[] }[]
  boards: { x: number; y: number; cells: number[] }[]
  units: number[][]
  cellUnits: number[][]
  at: Map<string, number>
}
const cache = new WeakMap<object, Topology>()
const key = (x: number, y: number) => `${x},${y}`

export function topology(puzzle: Pick<PuzzleDefinition, 'size' | 'boxSize' | 'boards'>): Topology {
  const cached = cache.get(puzzle)
  if (cached) return cached
  const { size, boxSize } = puzzle
  const origins = puzzle.boards ?? [{ x: 0, y: 0 }]
  if (
    ![9, 16].includes(size) ||
    boxSize * boxSize !== size ||
    !origins.length ||
    (puzzle.boards && size !== 9) ||
    origins.some(
      ({ x, y }) =>
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y) ||
        x < 0 ||
        y < 0 ||
        x % boxSize !== 0 ||
        y % boxSize !== 0 ||
        x > 900 ||
        y > 900,
    )
  ) {
    throw new Error('Некорректная схема полей')
  }
  if (new Set(origins.map(({ x, y }) => key(x, y))).size !== origins.length)
    throw new Error('Поля не должны полностью совпадать')
  const reached = new Set([0])
  for (let changed = true; changed;) {
    changed = false
    origins.forEach((a, i) => {
      if (
        !reached.has(i) &&
        [...reached].some((j) => Math.abs(a.x - origins[j].x) < size && Math.abs(a.y - origins[j].y) < size)
      ) {
        reached.add(i)
        changed = true
      }
    })
  }
  if (reached.size !== origins.length) throw new Error('Соедините поля общими блоками 3×3')
  const positions = new Map<string, { x: number; y: number; boards: number[] }>()
  origins.forEach((origin, b) => {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const x = origin.x + c,
          y = origin.y + r,
          id = key(x, y)
        if (!positions.has(id)) positions.set(id, { x, y, boards: [] })
        positions.get(id)!.boards.push(b)
      }
  })
  const cells = [...positions.values()].sort((a, b) => a.y - b.y || a.x - b.x)
  const at = new Map(cells.map((c, i) => [key(c.x, c.y), i]))
  const boards = origins.map((origin) => ({
    ...origin,
    cells: Array.from({ length: size * size }, (_, i) =>
      at.get(key(origin.x + (i % size), origin.y + Math.floor(i / size)))!,
    ),
  }))
  const units: number[][] = [],
    seen = new Set<string>()
  const addUnit = (unit: number[]) => {
    const id = [...unit].sort((a, b) => a - b).join(',')
    if (!seen.has(id)) {
      seen.add(id)
      units.push(unit)
    }
  }
  for (const board of boards)
    for (let i = 0; i < size; i++) {
      addUnit(Array.from({ length: size }, (_, c) => board.cells[i * size + c]))
      addUnit(Array.from({ length: size }, (_, r) => board.cells[r * size + i]))
      addUnit(
        Array.from(
          { length: size },
          (_, k) =>
            board.cells[
              (Math.floor(i / boxSize) * boxSize + Math.floor(k / boxSize)) * size +
                (i % boxSize) * boxSize +
                (k % boxSize)
            ],
        ),
      )
    }
  const cellUnits = cells.map(() => [] as number[])
  units.forEach((unit, i) => unit.forEach((c) => cellUnits[c].push(i)))
  const result = {
    width: Math.max(...origins.map((b) => b.x)) + size,
    height: Math.max(...origins.map((b) => b.y)) + size,
    cells,
    boards,
    units,
    cellUnits,
    at,
  }
  cache.set(puzzle, result)
  return result
}

export function emptyLayout(boards: GridPlacement[]): PuzzleDefinition {
  const puzzle: PuzzleDefinition = {
    size: 9,
    boxSize: 3,
    boards: boards.map((b) => ({ x: b.x, y: b.y })),
    givens: [],
  }
  puzzle.givens = topology(puzzle).cells.map(() => 0)
  return puzzle
}

export const puzzleTitle = (puzzle: PuzzleDefinition) =>
  puzzle.boards && puzzle.boards.length > 1
    ? `${puzzle.boards.length} ${puzzle.boards.length < 5 ? 'поля' : 'полей'} · 9 × 9`
    : `${puzzle.size} × ${puzzle.size}`

export function cellLabel(puzzle: PuzzleDefinition, index: number) {
  const t = topology(puzzle),
    cell = t.cells[index]
  if (!cell) return ''
  if (!puzzle.boards) return `Строка ${cell.y + 1}, столбец ${cell.x + 1}`
  return cell.boards
    .map((b) => `Поле ${b + 1}: строка ${cell.y - t.boards[b].y + 1}, столбец ${cell.x - t.boards[b].x + 1}`)
    .join(' · ')
}
