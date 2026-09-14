export type BoardSize = 9 | 16
export type RecognitionMode = 'all' | 'printed'
export type SolveMode = 'solve' | 'check'
export interface GridPlacement {
  x: number
  y: number
}
export interface PuzzleDefinition {
  size: BoardSize
  boxSize: 3 | 4
  givens: number[]
  /** Origins on a shared cell lattice. Omitted for a single classic board. */
  boards?: GridPlacement[]
}
export type PlacementKind = 'deduction' | 'guess' | 'retract'
export interface SolverStats {
  guesses: number
  deductions: number
  backtracks: number
  elapsedMs: number
}
export type SolverEvent =
  | { type: 'change'; index: number; value: number; kind: PlacementKind; depth: number; reason: string }
  | { type: 'solution'; values: number[] }
export interface SolveResult {
  status: 'unique' | 'multiple' | 'unsolvable' | 'invalid'
  values?: number[]
  conflicts?: number[]
}
export interface Point {
  x: number
  y: number
}
export type Corners = [Point, Point, Point, Point]
export interface CellRecognition {
  index: number
  value: number
  confidence: number
  needsReview: boolean
  raw: string
  rect: { x: number; y: number; w: number; h: number }
  /** Rectified crop, for composite photos whose cells have different transforms. */
  previewUrl?: string
}
export interface RecognitionResult {
  puzzle: PuzzleDefinition
  cells: CellRecognition[]
  imageUrl: string
  imageSize: { width: number; height: number }
  /** Unfiltered, rectified photos with full cell boundaries, one per board. */
  photos: {
    imageUrl: string
    width: number
    height: number
    rects: CellRecognition['rect'][]
  }[]
}
export type WorkerRequest =
  | { type: 'start'; puzzle: PuzzleDefinition; mode?: SolveMode }
  | { type: 'advance'; count: number }
  | { type: 'continue' }
export interface WorkerReply {
  type: 'ready' | 'batch' | 'timeout' | 'error'
  events?: SolverEvent[]
  result?: SolveResult
  stats?: SolverStats
  message?: string
}

export const emptyPuzzle = (size: BoardSize): PuzzleDefinition => ({
  size,
  boxSize: size === 9 ? 3 : 4,
  givens: Array<number>(size * size).fill(0),
})
