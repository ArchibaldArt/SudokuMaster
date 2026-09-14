import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Check, LoaderCircle, RotateCw, ScanLine, X } from 'lucide-react'
import type { BoardSize, Corners, RecognitionMode, RecognitionResult } from '../core/types'
import { CompositionCrop } from './CompositionCrop'
import { layouts } from '../core/topology'
import type { LayoutName } from '../core/topology'
import { photoGroups, photoLayoutError, photoTemplate, projectQuad } from '../core/photo-layout'
import { validCorners } from '../core/geometry'
import { PhotoProcessor, readPhoto, rotatePhoto } from '../services/photo'
import type { Detection, PhotoBoard, PhotoProgress, PhotoSource } from '../services/photo'

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
  const [boards, setBoards] = useState<PhotoBoard[] | null>(null)
  const [groups, setGroups] = useState<PhotoBoard[][]>([])
  const [editing, setEditing] = useState(false)
  const [activeBoard, setActiveBoard] = useState(-1)
  const [addX, setAddX] = useState(6)
  const [addY, setAddY] = useState(6)
  const [size, setSize] = useState(initialSize)
  const [mode, setMode] = useState<RecognitionMode>('all')
  const [phase, setPhase] = useState<'detecting' | 'crop' | 'recognizing'>('detecting')
  const [detected, setDetected] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<PhotoProgress>({ fraction: 0, label: 'Ищем границы поля…' })
  const processor = useRef<PhotoProcessor | null>(null)
  const alive = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const busy = phase !== 'crop'
  const chooseGroup = (group: PhotoBoard[]) => {
    setBoards(group.length > 1 ? group : null)
    setEditing(false)
    setActiveBoard(-1)
    if (group.length === 1) {
      setCorners(group[0].corners)
      return
    }
    const points = group.flatMap((b) => b.corners),
      xs = points.map((p) => p.x),
      ys = points.map((p) => p.y)
    setCorners([
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
      { x: Math.min(...xs), y: Math.max(...ys) },
    ])
  }
  const applyDetection = (result: Detection) => {
    setCorners(result.corners)
    setDetected(result.detected)
    if (result.suggestedSize) setSize(result.suggestedSize)
    const groups = result.boards ? photoGroups(result.boards) : []
    setGroups(groups.length > 1 ? groups : [])
    setBoards(null)
    setEditing(false)
    setActiveBoard(-1)
    if (groups[0]) chooseGroup(groups[0])
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    alive.current = true
    const service = new PhotoProcessor()
    processor.current = service
    let cancelled = false
    setMode('all')
    void (async () => {
      try {
        const photo = await readPhoto(file)
        if (cancelled) return
        setSource(photo)
        const result = await service.detect(photo)
        if (cancelled) return
        applyDetection(result)
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
      document.body.style.overflow = overflow
      previous?.focus({ preventScroll: true })
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
      applyDetection(result)
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
      const result = await processor.current!.recognize(
        source,
        corners,
        size,
        (p) => {
          if (alive.current) setProgress(p)
        },
        boards ?? undefined,
        mode,
      )
      if (alive.current) onRecognized(result)
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'Ошибка распознавания')
        setPhase('crop')
      }
    }
  }
  const layoutError =
    source && boards ? photoLayoutError(boards, source.image.width, source.image.height) : ''
  const valid =
    !!source &&
    !!corners &&
    (boards ? !layoutError : validCorners(corners, source.image.width, source.image.height))
  const useTemplate = (name: string) => {
    if (!source || !corners) return
    if (name === 'classic') {
      setBoards(null)
      setGroups([])
      setEditing(false)
      return
    }
    const origins = layouts[name as LayoutName].boards
    const width = Math.max(...origins.map((b) => b.x)) + 9,
      height = Math.max(...origins.map((b) => b.y)) + 9
    const scale = Math.min(source.image.width / width, source.image.height / height) * 0.9
    const x = (source.image.width - width * scale) / 2,
      y = (source.image.height - height * scale) / 2
    const frame: Corners = [
      { x, y },
      { x: x + width * scale, y },
      { x: x + width * scale, y: y + height * scale },
      { x, y: y + height * scale },
    ]
    setCorners(frame)
    setBoards(photoTemplate(origins, frame))
    setSize(9)
    setGroups([])
    setActiveBoard(-1)
    setEditing(true)
  }
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
              dialog.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"], summary',
              ),
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
              {phase === 'recognizing'
                ? 'Распознаём вашу задачу'
                : boards
                  ? 'Проверьте поля'
                  : 'Проверьте границы судоку'}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть обработку фотографии">
            <X size={21} />
          </button>
        </div>
        <div className="photo-dialog-body">
          <p className="dialog-description">
            {phase === 'recognizing'
              ? 'После распознавания вы сможете проверить и исправить каждую клетку.'
              : boards
                ? `Найдено ${boards.length} полей. Проверьте рамки и общие блоки.`
                : 'Перетащите четыре точки к внешним углам сетки. Числа должны читаться сверху вниз.'}
          </p>
          {!busy && source && (
            <fieldset className="recognition-modes" aria-describedby="recognition-mode-help">
              <legend>Что распознавать</legend>
              <label>
                <input
                  type="radio"
                  name="recognition-mode"
                  value="all"
                  checked={mode === 'all'}
                  onChange={() => setMode('all')}
                />
                <strong>Все числа</strong>
              </label>
              <label>
                <input
                  type="radio"
                  name="recognition-mode"
                  value="printed"
                  checked={mode === 'printed'}
                  onChange={() => setMode('printed')}
                />
                <strong>Только печатные</strong>
              </label>
              <p id="recognition-mode-help">
                {mode === 'all'
                  ? 'Для незаполненной задачи. Сохраняем числа любого цвета.'
                  : 'Оставляем крупные чёрные цифры, убираем цветные записи и мелкие пометки. Результат нужно проверить.'}
              </p>
            </fieldset>
          )}
          <div className="crop-stage">
            {source && boards && corners ? (
              <CompositionCrop
                source={source}
                boards={boards}
                frame={corners}
                active={activeBoard}
                editing={editing && !busy}
                onChange={setBoards}
                onSelect={(i) => {
                  if (!busy) {
                    setActiveBoard(i)
                    setEditing(true)
                  }
                }}
                onFrame={(frame) => {
                  setCorners(frame)
                  setBoards(photoTemplate(boards, frame))
                }}
              />
            ) : (
              source && (
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
                            onPointerUp={(event) =>
                              event.currentTarget.releasePointerCapture(event.pointerId)
                            }
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
              )
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
          {!busy && source && (
            <div className="layout-tools">
              {boards?.some((b) => b.confidence > 0 && b.confidence < 0.94) && (
                <p className="detection-note">
                  Некоторые границы найдены приблизительно. Проверьте все поля перед распознаванием.
                </p>
              )}
              {groups.length > 1 && (
                <label>
                  На фото несколько задач
                  <select
                    aria-label="Выбрать задачу на фото"
                    onChange={(e) => {
                      chooseGroup(groups[Number(e.target.value)])
                    }}
                  >
                    {groups.map((g, i) => (
                      <option value={i} key={i}>
                        Задача {i + 1} · {g.length} полей
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {boards && (
                <button className="text-button" onClick={() => setEditing(!editing)}>
                  {editing ? 'Закончить правку схемы' : 'Исправить схему'}
                </button>
              )}
              <details className="layout-presets">
                <summary>Выбрать другую схему</summary>
                <div className="layout-presets-list">
                  <button className="button secondary small" onClick={() => useTemplate('classic')}>
                    Одно поле
                  </button>
                  {(Object.keys(layouts) as LayoutName[]).map((n) => (
                    <button className="button secondary small" key={n} onClick={() => useTemplate(n)}>
                      {layouts[n].name}
                    </button>
                  ))}
                </div>
              </details>
              {boards && editing && (
                <div className="layout-editor">
                  <label>
                    Поправить границы
                    <select
                      aria-label="Поле для правки границ"
                      value={activeBoard}
                      onChange={(e) => setActiveBoard(Number(e.target.value))}
                    >
                      <option value={-1}>Вся схема</option>
                      {boards.map((_, i) => (
                        <option key={i} value={i}>
                          Поле {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    Перетащите четыре точки к углам. Выберите отдельное поле, чтобы рассмотреть его крупнее.
                  </p>
                  {activeBoard >= 0 && boards[activeBoard] && (
                    <>
                      <label>
                        Позиция поля по горизонтали (блоки)
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={boards[activeBoard].x / 3}
                          onChange={(e) =>
                            setBoards(
                              boards.map((b, i) =>
                                i === activeBoard ? { ...b, x: Number(e.target.value) * 3 } : b,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Позиция поля по вертикали (блоки)
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={boards[activeBoard].y / 3}
                          onChange={(e) =>
                            setBoards(
                              boards.map((b, i) =>
                                i === activeBoard ? { ...b, y: Number(e.target.value) * 3 } : b,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        className="button secondary small"
                        disabled={boards.length <= 1}
                        onClick={() => {
                          setBoards(boards.filter((_, i) => i !== activeBoard))
                          setActiveBoard(-1)
                        }}
                      >
                        Удалить поле {activeBoard + 1}
                      </button>
                    </>
                  )}
                  <details>
                    <summary>Добавить пропущенное поле</summary>
                    <p>Позиция верхнего левого угла: 0 — первый блок схемы. Общие блоки должны совпадать.</p>
                    <label>
                      Блок по горизонтали
                      <input
                        aria-label="Новое поле: блок по горизонтали"
                        type="number"
                        min={0}
                        max={30}
                        value={addX / 3}
                        onChange={(e) => setAddX(Number(e.target.value) * 3)}
                      />
                    </label>
                    <label>
                      Блок по вертикали
                      <input
                        aria-label="Новое поле: блок по вертикали"
                        type="number"
                        min={0}
                        max={30}
                        value={addY / 3}
                        onChange={(e) => setAddY(Number(e.target.value) * 3)}
                      />
                    </label>
                    <button
                      className="button secondary small"
                      onClick={() => {
                        const anchor = boards[Math.max(0, activeBoard)]
                        const quad = [
                          [addX, addY],
                          [addX + 9, addY],
                          [addX + 9, addY + 9],
                          [addX, addY + 9],
                        ].map(([x, y]) => {
                          const p = projectQuad(anchor.corners, (x - anchor.x) / 9, (y - anchor.y) / 9)
                          return {
                            x: Math.max(0, Math.min(source.image.width, p.x)),
                            y: Math.max(0, Math.min(source.image.height, p.y)),
                          }
                        }) as Corners
                        const next: PhotoBoard = { x: addX, y: addY, corners: quad, confidence: 0 }
                        setBoards([...boards, next])
                        setActiveBoard(boards.length)
                      }}
                    >
                      Добавить поле
                    </button>
                  </details>
                </div>
              )}
            </div>
          )}
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
              {!boards && (
                <label>
                  Размер{' '}
                  <select value={size} onChange={(event) => setSize(Number(event.target.value) as BoardSize)}>
                    <option value={9}>9 × 9</option>
                    <option value={16}>16 × 16</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {!busy && corners && !valid && (
            <p className="error-message" role="alert">
              {layoutError || 'Поправьте углы: границы не должны пересекаться.'}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button className="button secondary" onClick={onClose}>
            {busy ? 'Отменить' : 'Назад'}
          </button>
          <button
            className="button primary"
            disabled={busy || !valid}
            onClick={() => void recognize()}
            aria-label={boards ? 'Схема верна — распознать числа' : 'Распознать числа'}
          >
            <ScanLine size={18} />{' '}
            {boards ? (
              <>
                <span className="photo-action-long">Схема верна — распознать числа</span>
                <span className="photo-action-short" aria-hidden="true">
                  Распознать числа
                </span>
              </>
            ) : (
              <span>Распознать числа</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
