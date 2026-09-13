import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ArrowRight, Check, LoaderCircle, RotateCw, ScanLine, X } from 'lucide-react'
import type { BoardSize, Corners, RecognitionResult } from '../core/types'
import { validCorners } from '../core/geometry'
import { PhotoProcessor, readPhoto, rotatePhoto } from '../services/photo'
import type { PhotoProgress, PhotoSource } from '../services/photo'

export function PhotoDialog({
  file,
  initialSize,
  onClose,
  onRecognized,
}: {
  file: File
  initialSize: BoardSize
  onClose: () => void
  onRecognized: (result: RecognitionResult) => void
}) {
  const [source, setSource] = useState<PhotoSource | null>(null)
  const [corners, setCorners] = useState<Corners | null>(null)
  const [size, setSize] = useState(initialSize)
  const [phase, setPhase] = useState<'detecting' | 'crop' | 'recognizing'>('detecting')
  const [detected, setDetected] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<PhotoProgress>({ fraction: 0, label: 'Ищем границы поля…' })
  const processor = useRef<PhotoProcessor | null>(null)
  const alive = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const busy = phase !== 'crop'
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    alive.current = true
    const service = new PhotoProcessor()
    processor.current = service
    let cancelled = false
    void (async () => {
      try {
        const photo = await readPhoto(file)
        if (cancelled) return
        setSource(photo)
        const result = await service.detect(photo)
        if (cancelled) return
        setCorners(result.corners)
        setDetected(result.detected)
        if (result.suggestedSize) setSize(result.suggestedSize)
        setPhase('crop')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось прочитать фото')
          setPhase('crop')
        }
      }
    })()
    return () => {
      cancelled = true
      alive.current = false
      service.cancel()
      previous?.focus()
    }
  }, [file])
  const rotate = async () => {
    if (!source) return
    const next = rotatePhoto(source)
    setSource(next)
    setCorners(null)
    setPhase('detecting')
    setError('')
    try {
      const result = await processor.current!.detect(next)
      if (!alive.current) return
      setCorners(result.corners)
      setDetected(result.detected)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Ошибка обработки')
    } finally {
      if (alive.current) setPhase('crop')
    }
  }
  const move = (event: PointerEvent<SVGCircleElement>, index: number) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !source || !svg.current) return
    const bounds = svg.current.getBoundingClientRect()
    const x = Math.max(
      0,
      Math.min(source.image.width, ((event.clientX - bounds.left) / bounds.width) * source.image.width),
    )
    const y = Math.max(
      0,
      Math.min(source.image.height, ((event.clientY - bounds.top) / bounds.height) * source.image.height),
    )
    setCorners((previous) => previous!.map((p, i) => (i === index ? { x, y } : p)) as Corners)
  }
  const recognize = async () => {
    if (!source || !corners) return
    setPhase('recognizing')
    setError('')
    try {
      const result = await processor.current!.recognize(source, corners, size, (p) => {
        if (alive.current) setProgress(p)
      })
      if (alive.current) onRecognized(result)
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'Ошибка распознавания')
        setPhase('crop')
      }
    }
  }
  const valid = !!source && !!corners && validCorners(corners, source.image.width, source.image.height)
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialog}
        className="photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'Tab') {
            const targets = Array.from(
              dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), select, [tabindex="0"]'),
            )
            const first = targets[0],
              last = targets.at(-1)
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            }
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">ИЗ ФОТОГРАФИИ В ПОЛЕ</span>
            <h2 id="photo-title">
              {phase === 'recognizing' ? 'Распознаём вашу задачу' : 'Проверьте границы судоку'}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть обработку фотографии">
            <X size={21} />
          </button>
        </div>
        <p className="dialog-description">
          {phase === 'recognizing'
            ? 'Выделяем печатные числа. После распознавания вы сможете проверить и исправить каждую клетку.'
            : 'Перетащите четыре точки к внешним углам сетки. Числа должны читаться сверху вниз.'}
        </p>
        <div className="crop-stage">
          {source && (
            <svg
              ref={svg}
              viewBox={`0 0 ${source.image.width} ${source.image.height}`}
              style={{ aspectRatio: `${source.image.width}/${source.image.height}` }}
              aria-label="Выделение границ поля"
            >
              <image href={source.url} width={source.image.width} height={source.image.height} />
              {corners && (
                <>
                  <polygon
                    points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(36,87,214,.08)"
                    stroke={valid ? '#729aff' : '#f3997f'}
                    strokeWidth={Math.max(3, source.image.width / 240)}
                  />
                  {!busy &&
                    corners.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={source.image.width / 45}
                        fill="#fff"
                        stroke="#2457d6"
                        strokeWidth={source.image.width / 300}
                        tabIndex={0}
                        role="button"
                        aria-label={`Угол ${['сверху слева', 'сверху справа', 'снизу справа', 'снизу слева'][i]}`}
                        onPointerDown={(event) => {
                          event.currentTarget.setPointerCapture(event.pointerId)
                          event.preventDefault()
                        }}
                        onPointerMove={(event) => move(event, i)}
                        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                        onKeyDown={(event) => {
                          const directions: Record<string, [number, number]> = {
                            ArrowLeft: [-1, 0],
                            ArrowRight: [1, 0],
                            ArrowUp: [0, -1],
                            ArrowDown: [0, 1],
                          }
                          if (directions[event.key]) {
                            event.preventDefault()
                            const [dx, dy] = directions[event.key],
                              step = source.image.width / 200
                            setCorners(
                              corners.map((point, k) =>
                                k === i
                                  ? {
                                      x: Math.max(0, Math.min(source.image.width, point.x + dx * step)),
                                      y: Math.max(0, Math.min(source.image.height, point.y + dy * step)),
                                    }
                                  : point,
                              ) as Corners,
                            )
                          }
                        }}
                      />
                    ))}
                </>
              )}
            </svg>
          )}
          {busy && (
            <div className="processing-overlay">
              <div className="processing-card">
                <LoaderCircle className="spin" size={30} />
                <strong>
                  {phase === 'detecting' ? 'Ищем сетку…' : `${Math.round(progress.fraction * 100)}%`}
                </strong>
                <span>
                  {phase === 'detecting' ? 'Подготовка фотографии на вашем устройстве' : progress.label}
                </span>
                {phase === 'recognizing' && (
                  <progress value={progress.fraction} max={1} aria-label="Прогресс распознавания" />
                )}
              </div>
            </div>
          )}
        </div>
        {error && (
          <p className="error-message" role="alert">
            {error} Ручной ввод доступен после закрытия этого окна.
          </p>
        )}
        {!busy && source && (
          <div className="crop-options">
            <button className="button secondary small" onClick={() => void rotate()}>
              <RotateCw size={16} /> Повернуть
            </button>
            <span className="detection-note">
              {detected ? (
                <>
                  <Check size={15} /> Границы найдены
                </>
              ) : (
                'Укажите границы вручную'
              )}
            </span>
            <label>
              Размер{' '}
              <select value={size} onChange={(event) => setSize(Number(event.target.value) as BoardSize)}>
                <option value={9}>9 × 9</option>
                <option value={16}>16 × 16</option>
              </select>
            </label>
          </div>
        )}
        {!busy && corners && !valid && (
          <p className="error-message">Поправьте углы: границы не должны пересекаться.</p>
        )}
        <div className="dialog-actions">
          <button className="button secondary" onClick={onClose}>
            {busy ? 'Отменить' : 'Назад'}
          </button>
          <button className="button primary" disabled={busy || !valid} onClick={() => void recognize()}>
            <ScanLine size={18} /> Распознать числа <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}
