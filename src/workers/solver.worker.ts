import { solvePuzzle } from '../core/solver'
import type { SolveResult, SolverEvent, SolverStats, WorkerReply, WorkerRequest } from '../core/types'

let iterator: Generator<SolverEvent, SolveResult> | undefined
let stats: SolverStats = { guesses: 0, deductions: 0, backtracks: 0, elapsedMs: 0 }
let deadline = 30_000
let firstSolution = false
let suspended = false
let checkOnly = false
const reply = (message: WorkerReply) => self.postMessage(message)

self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === 'start') {
      stats = { guesses: 0, deductions: 0, backtracks: 0, elapsedMs: 0 }
      deadline = 30_000
      firstSolution = false
      suspended = false
      checkOnly = data.mode === 'check'
      iterator = solvePuzzle(data.puzzle, stats)
      reply({ type: 'ready', stats })
    } else if (data.type === 'continue') {
      deadline = stats.elapsedMs + 30_000
      suspended = false
      reply({ type: 'ready', stats })
    } else if (data.type === 'advance' && iterator && !suspended) {
      const events: SolverEvent[] = []
      const started = performance.now()
      let result: SolveResult | undefined
      let timeout = false
      const limit = firstSolution || checkOnly ? 1024 : Math.max(1, Math.min(256, data.count))
      for (let i = 0; i < limit; i++) {
        const step = iterator.next()
        if (step.done) {
          // Validation never sends a solution or intermediate digits to the UI.
          result = checkOnly ? { status: step.value.status, conflicts: step.value.conflicts } : step.value
          iterator = undefined
          break
        }
        if (!firstSolution && !checkOnly) events.push(step.value)
        if (step.value.type === 'solution') {
          firstSolution = true
          break
        }
        if (stats.elapsedMs + performance.now() - started >= deadline) {
          timeout = true
          break
        }
        if (performance.now() - started >= 8) break
      }
      stats.elapsedMs += performance.now() - started
      suspended = timeout
      reply({ type: timeout ? 'timeout' : 'batch', events, stats, result })
    }
  } catch (error) {
    iterator = undefined
    reply({ type: 'error', message: error instanceof Error ? error.message : 'Ошибка решателя' })
  }
}
