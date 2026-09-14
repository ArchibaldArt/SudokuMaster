import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PlacementKind,
  PuzzleDefinition,
  SolveResult,
  SolveMode,
  SolverStats,
  WorkerReply,
  WorkerRequest,
} from '../core/types'

export type SolvePhase = 'idle' | 'running' | 'paused' | 'checking' | 'timeout' | 'finished' | 'error'
export type Speed = 'slow' | 'normal' | 'fast'
const initialStats = (): SolverStats => ({ guesses: 0, deductions: 0, backtracks: 0, elapsedMs: 0 })
export function useSolver(puzzle: PuzzleDefinition) {
  const [phase, setPhase] = useState<SolvePhase>('idle')
  const [mode, setMode] = useState<SolveMode>('solve')
  const [values, setValues] = useState<number[] | null>(null)
  const [kinds, setKinds] = useState<Record<number, PlacementKind>>({})
  const [latest, setLatest] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [stats, setStats] = useState(initialStats)
  const [result, setResult] = useState<SolveResult | null>(null)
  const [hasSolution, setHasSolution] = useState(false)
  const [speed, setSpeedState] = useState<Speed>('fast')
  const worker = useRef<Worker | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const state = useRef({
    paused: false,
    pending: false,
    solved: false,
    speed,
    timedOut: false,
    mode: 'solve' as SolveMode,
  })
  const stopWorker = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    worker.current?.terminate()
    worker.current = null
  }, [])
  const reset = useCallback(() => {
    stopWorker()
    setPhase('idle')
    setMode('solve')
    setValues(null)
    setKinds({})
    setLatest(null)
    setReason('')
    setStats(initialStats())
    setResult(null)
    setHasSolution(false)
  }, [stopWorker])
  useEffect(() => {
    reset()
    return stopWorker
  }, [puzzle, reset, stopWorker])

  const advance = useCallback(() => {
    if (!worker.current || state.current.paused || state.current.pending || state.current.timedOut) return
    state.current.pending = true
    worker.current.postMessage({
      type: 'advance',
      count: state.current.mode === 'check' || state.current.speed === 'fast' ? 256 : 1,
    } satisfies WorkerRequest)
  }, [])
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (state.current.paused || state.current.timedOut) return
    const delay =
      state.current.mode === 'check' || state.current.solved || state.current.speed === 'fast'
        ? 0
        : state.current.speed === 'slow'
          ? 300
          : 70
    timer.current = setTimeout(advance, delay)
  }, [advance])
  const start = useCallback(
    (mode: SolveMode = 'solve') => {
      reset()
      state.current = {
        paused: false,
        pending: false,
        solved: false,
        speed: state.current.speed,
        timedOut: false,
        mode,
      }
      setMode(mode)
      if (mode === 'solve') setValues([...puzzle.givens])
      setPhase('running')
      const instance = new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })
      worker.current = instance
      instance.onerror = () => {
        if (worker.current !== instance) return
        setPhase('error')
        setValues(null)
        setKinds({})
        setHasSolution(false)
        setReason('Не удалось запустить решатель. Попробуйте ещё раз.')
        stopWorker()
      }
      instance.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (worker.current !== instance) return
        state.current.pending = false
        if (data.stats) setStats(data.stats)
        if (data.type === 'error') {
          setPhase('error')
          setValues(null)
          setKinds({})
          setHasSolution(false)
          setReason('Не удалось завершить вычисления. Попробуйте ещё раз.')
          stopWorker()
          return
        }
        if (mode === 'solve' && data.events?.length) {
          const events = data.events
          setValues((previous) => {
            const next = [...(previous ?? puzzle.givens)]
            for (const event of events) {
              if (event.type === 'change') next[event.index] = event.value
              else return event.values
            }
            return next
          })
          setKinds((previous) => {
            const next = { ...previous }
            for (const event of events)
              if (event.type === 'change') {
                if (event.value) next[event.index] = event.kind
                else delete next[event.index]
              }
            return next
          })
          const last = events.at(-1)!
          if (last.type === 'change') {
            setLatest(last.index)
            setReason(last.reason)
          }
          if (events.some((event) => event.type === 'solution')) {
            state.current.solved = true
            setHasSolution(true)
            setLatest(null)
            if (!state.current.paused) setPhase('checking')
          }
        }
        if (data.result) {
          setResult(mode === 'check' ? { status: data.result.status } : data.result)
          setPhase('finished')
          setLatest(null)
          if (mode === 'solve' && data.result.values) setValues(data.result.values)
          else if (mode === 'solve') {
            setValues([...puzzle.givens])
            setKinds({})
          }
          stopWorker()
          return
        }
        if (data.type === 'timeout') {
          state.current.timedOut = true
          setPhase('timeout')
          return
        }
        schedule()
      }
      instance.postMessage({ type: 'start', puzzle, mode } satisfies WorkerRequest)
    },
    [puzzle, reset, schedule, stopWorker],
  )
  const pause = () => {
    state.current.paused = true
    if (timer.current) clearTimeout(timer.current)
    setPhase('paused')
  }
  const resume = () => {
    state.current.paused = false
    setPhase(state.current.solved ? 'checking' : 'running')
    if (state.current.timedOut) {
      state.current.timedOut = false
      worker.current?.postMessage({ type: 'continue' } satisfies WorkerRequest)
    } else advance()
  }
  const setSpeed = (next: Speed) => {
    state.current.speed = next
    setSpeedState(next)
    schedule()
  }
  return {
    phase,
    mode,
    values,
    kinds,
    latest,
    reason,
    stats,
    result,
    hasSolution,
    speed,
    setSpeed,
    start,
    pause,
    resume,
    reset,
  }
}
