import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { version } from '../package.json'
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Eraser,
  FileImage,
  Grid3X3,
  LoaderCircle,
  ListChecks,
  Maximize2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Square,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { CompositeBoard } from './components/CompositeBoard'
import { cellLabel, emptyLayout, layouts, puzzleTitle } from './core/topology'
import type { LayoutName } from './core/topology'
import { compositeExample } from './data/composite'
import { BoardViewport } from './components/BoardViewport'
import { ScaleControls } from './components/ScaleControls'
import { PhotoDialog } from './components/PhotoDialog'
import { CameraDialog } from './components/CameraDialog'
import { Dialog } from './components/Dialog'
import { validatePuzzle } from './core/solver'
import { emptyPuzzle } from './core/types'
import type { BoardSize, RecognitionResult } from './core/types'
import { getExample } from './data/examples'
import { useSolver } from './hooks/useSolver'
import type { Speed } from './hooks/useSolver'
import { downloadBlob, solutionImage } from './services/export'

export default function App() {
  const [puzzle, setPuzzle] = useState(() => emptyPuzzle(9))
  const [name, setName] = useState('Новое судоку')
  const [selected, setSelected] = useState<number | null>(null)
  const [hasTask, setHasTask] = useState(false)
  const [overlay, setOverlay] = useState<'camera' | 'source' | 'settings' | 'help' | 'editor' | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [review, setReview] = useState<RecognitionResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [uncertain, setUncertain] = useState<Set<number>>(new Set())
  const [editorMode, setEditorMode] = useState<'uncertain' | 'all'>('all')
  const [editorCells, setEditorCells] = useState<number[]>([])
  const [view, setView] = useState<'grid' | 'photo'>('grid')
  const [zoom, setZoom] = useState(false)
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const dock = useRef<HTMLElement>(null)
  const menu = useRef<HTMLDetailsElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const solveButton = useRef<HTMLButtonElement>(null)
  const editorBody = useRef<HTMLDivElement>(null)
  const boardView = useRef<HTMLDivElement>(null)
  const photoScroll = useRef<{ element: HTMLElement; left: number; top: number } | null>(null)
  const solver = useSolver(puzzle)
  const validation = useMemo(() => validatePuzzle(puzzle), [puzzle])
  const conflicts = useMemo(() => new Set(validation.conflicts), [validation])
  const checkOnly = solver.mode === 'check'
  const locked = !['idle', 'error'].includes(solver.phase) && !(checkOnly && solver.phase === 'finished')
  const active = ['running', 'checking', 'paused', 'timeout'].includes(solver.phase)
  const values = solver.values ?? puzzle.givens
  const filled = values.filter(Boolean).length
  const hasNumbers = puzzle.givens.some(Boolean)
  const checkPassed = !checkOnly || solver.result?.status === 'unique' || solver.result?.status === 'multiple'
  const ready = hasTask && hasNumbers && validation.valid && confirmed && !active && checkPassed
  const needsConfirmation = hasTask && (!confirmed || (checkOnly && solver.phase === 'error'))
  const needsChecking = !!review && !confirmed
  const solved = solver.hasSolution
  useEffect(() => {
    if (ready && !locked) solveButton.current?.focus({ preventScroll: true })
  }, [ready, locked])
  useEffect(() => {
    if (overlay === 'editor') editorBody.current?.scrollTo(0, 0)
  }, [selected, overlay])
  useLayoutEffect(() => {
    // Safari can adjust the scroll offset when the focused grid's inputs become visible.
    const saved = photoScroll.current
    if (saved) saved.element.scrollTo(saved.left, saved.top)
    photoScroll.current = null
  }, [view])
  const togglePhoto = () => {
    const element = boardView.current?.querySelector<HTMLElement>('.grid-viewport')
    if (element) photoScroll.current = { element, left: element.scrollLeft, top: element.scrollTop }
    setView(view === 'photo' ? 'grid' : 'photo')
  }
  const PuzzleBoard = puzzle.boards ? CompositeBoard : BoardViewport
  const selectedCellLabel = selected === null ? '' : cellLabel(puzzle, selected)
  const editorPosition = editorMode === 'all' ? (selected ?? -1) : editorCells.indexOf(selected ?? -1)
  const editorTotal = editorMode === 'all' ? puzzle.givens.length : editorCells.length
  const editorLast = editorPosition === editorTotal - 1
  const selectedPreview = selected === null ? undefined : review?.cells[selected]?.previewUrl
  const selectedRect = selected !== null ? review?.cells[selected]?.rect : undefined
  const cropStyle = selectedPreview
    ? {
        backgroundImage: `url(${selectedPreview})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : review && selectedRect
      ? {
          backgroundImage: `url(${review.imageUrl})`,
          backgroundSize: `${(review.imageSize.width / selectedRect.w) * 100}% ${(review.imageSize.height / selectedRect.h) * 100}%`,
          backgroundPosition: `${(selectedRect.x / (review.imageSize.width - selectedRect.w)) * 100}% ${(selectedRect.y / (review.imageSize.height - selectedRect.h)) * 100}%`,
        }
      : undefined
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      document.documentElement.style.setProperty(
        '--dock-height',
        `${entries[0].target.getBoundingClientRect().height}px`,
      )
    })
    if (dock.current) observer.observe(dock.current)
    const viewport = window.visualViewport
    const resize = () => setKeyboardOpen(!!viewport && viewport.height < window.innerHeight * 0.75)
    viewport?.addEventListener('resize', resize)
    const dismiss = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => {
      observer.disconnect()
      viewport?.removeEventListener('resize', resize)
      document.removeEventListener('pointerdown', dismiss)
    }
  }, [])
  const closeMenu = () => {
    if (menu.current) menu.current.open = false
  }
  const configureEditor = (index: number, mode: typeof editorMode, focusFirst = false) => {
    setEditorMode(mode)
    // Keep a stable queue: editing removes the warning, but must not skip the next cell or break Back.
    const remaining = [...uncertain].sort((a, b) => a - b)
    const start = remaining.findIndex((cell) => cell >= index)
    const cells = start > 0 ? [...remaining.slice(start), ...remaining.slice(0, start)] : remaining
    setEditorCells(cells)
    if (focusFirst && mode === 'uncertain' && cells.length) setSelected(cells[0])
  }
  const openOverlay = (next: typeof overlay) => {
    closeMenu()
    if (next === 'editor' && selected !== null)
      configureEditor(selected, review && uncertain.size ? 'uncertain' : 'all')
    setOverlay(next)
  }
  const upload = () => {
    closeMenu()
    setOverlay(null)
    fileInput.current?.click()
  }
  const selectCell = (index: number) => {
    if (hasTask) {
      setSelected(index)
      setInspecting(true)
    }
  }
  const loadExample = (size: BoardSize) => {
    closeMenu()
    setHasTask(true)
    setInspecting(false)
    solver.reset()
    setPuzzle(getExample(size))
    setName(size === 9 ? 'Классический пример' : 'Задача из журнала')
    setReview(null)
    setConfirmed(true)
    setUncertain(new Set())
    setSelected(0)
    setError('')
    setView('grid')
    setScale(1)
  }
  const loadComposite = (layout: LayoutName) => {
    loadExample(9)
    setPuzzle(compositeExample(layout))
    setName(layouts[layout].name)
  }
  const clear = (size = puzzle.size, preserveLayout = true) => {
    closeMenu()
    setHasTask(true)
    setInspecting(false)
    solver.reset()
    setPuzzle(preserveLayout && puzzle.boards ? emptyLayout(puzzle.boards) : emptyPuzzle(size))
    setName('Ваша задача')
    setReview(null)
    setConfirmed(false)
    setUncertain(new Set())
    setSelected(0)
    setView('grid')
    setScale(1)
    setError('')
  }
  const change = (index: number, value: number) => {
    if (locked || !hasTask) return
    setPuzzle((previous) => ({
      ...previous,
      givens: previous.givens.map((v, i) => (i === index ? value : v)),
    }))
    setUncertain((previous) => {
      const next = new Set(previous)
      next.delete(index)
      return next
    })
    setConfirmed(false)
    setError('')
  }
  const confirmNumbers = () => {
    setConfirmed(true)
    setUncertain(new Set())
    setInspecting(false)
    solver.start('check')
  }
  const stop = () => {
    if (checkOnly) setConfirmed(false)
    solver.reset()
  }
  const acceptFile = (next: File | undefined) => {
    if (!next) return
    solver.reset()
    setConfirmed(false)
    setFile(next)
    setError('')
  }
  const recognized = (result: RecognitionResult) => {
    setHasTask(true)
    setInspecting(false)
    setPuzzle(result.puzzle)
    setReview(result)
    setConfirmed(false)
    setUncertain(new Set(result.cells.filter((cell) => cell.needsReview).map((cell) => cell.index)))
    setName(file?.name ?? 'Задача с фотографии')
    setFile(null)
    setSelected(result.cells.find((cell) => cell.needsReview)?.index ?? 0)
    setView('grid')
    setScale(1)
  }
  const nextUncertain = () => {
    const remaining = [...uncertain].sort((a, b) => a - b)
    const next = remaining.find((i) => i >= (selected ?? -1)) ?? remaining[0]
    if (next !== undefined) {
      configureEditor(next, 'uncertain')
      setSelected(next)
      setInspecting(true)
      setView('grid')
      setOverlay('editor')
    }
  }
  const confirmCell = (index: number) => {
    setUncertain((previous) => {
      const next = new Set(previous)
      next.delete(index)
      return next
    })
  }
  const nextEditorCell = () => {
    if (selected === null || locked || (editorMode === 'all' && editorLast)) return
    confirmCell(selected)
    if (editorMode === 'uncertain' && editorLast) setOverlay(null)
    else selectCell(editorMode === 'all' ? selected + 1 : editorCells[editorPosition + 1])
  }
  const download = async () => {
    setExporting(true)
    setError('')
    try {
      const status =
        solver.result?.status === 'unique'
          ? 'Единственное решение'
          : solver.result?.status === 'multiple'
            ? 'Один из возможных вариантов'
            : 'Единственность не установлена'
      downloadBlob(
        await solutionImage(puzzle, values, status),
        puzzle.boards
          ? `SudokuMaster-${puzzle.boards.length}-fields.png`
          : `SudokuMaster-${puzzle.size}x${puzzle.size}.png`,
      )
    } catch {
      setError('Не удалось сохранить изображение. Попробуйте скачать его ещё раз.')
    } finally {
      setExporting(false)
    }
  }
  let statusTitle = !hasTask
    ? 'Добавьте фото судоку'
    : ready
      ? 'Всё готово к решению'
      : 'Добавьте числа в поле'
  let statusText = !hasTask
    ? 'Сделайте снимок или выберите готовый.'
    : ready
      ? 'Нажмите «Решить судоку».'
      : 'Выберите клетку и введите число.'
  let tone = 'neutral'
  if (needsChecking) {
    statusTitle = 'Сначала проверим числа'
    statusText = 'Сверьте поле с фото и исправьте ошибки.'
    tone = 'warning'
  } else if (needsConfirmation) {
    statusTitle = 'Введите исходные числа'
    statusText = 'Когда закончите, нажмите «Я заполнил числа» — проверим судоку автоматически.'
  }
  if (!validation.valid) {
    statusTitle = 'В исходных числах есть конфликт'
    statusText = 'Сначала исправьте числа, отмеченные красным.'
    tone = 'danger'
  }
  if (solver.phase === 'running') {
    statusTitle = 'Ищем решение'
    statusText = solver.reason || 'Проверяем возможные значения в клетках.'
    tone = 'working'
  }
  if (solver.phase === 'checking') {
    statusTitle = 'Решение найдено'
    statusText = 'Проверяем, единственное ли оно. Поле уже можно скачать.'
    tone = 'working'
  }
  if (solver.phase === 'paused') {
    statusTitle = 'Поиск на паузе'
    statusText = 'Продолжите, когда будете готовы.'
  }
  if (solver.phase === 'timeout') {
    statusTitle = 'Поиск приостановлен'
    statusText = solved
      ? 'Решение найдено, единственность пока не установлена. Можно продолжить проверку.'
      : 'Прошло 30 секунд вычислений. Можно продолжить поиск ещё на 30 секунд.'
    tone = 'warning'
  }
  if (solver.phase === 'finished') {
    if (solver.result?.status === 'unique') {
      statusTitle = 'Судоку решено!'
      statusText = 'Найдено единственное решение. Сохраните его на память.'
      tone = 'success'
    } else if (solver.result?.status === 'multiple') {
      statusTitle = 'Есть несколько решений'
      statusText = 'Показываем один корректный вариант. Проверьте, все ли исходные числа перенесены.'
      tone = 'warning'
    } else {
      statusTitle = 'У этой задачи нет решения'
      statusText = 'Проверьте исходные числа: возможно, одно из них было введено или распознано неверно.'
      tone = 'danger'
    }
  }
  if (solver.phase === 'error') {
    statusTitle = 'Не удалось завершить поиск'
    statusText = solver.reason
    tone = 'danger'
  }
  if (checkOnly) {
    if (solver.phase === 'running' || solver.phase === 'checking') {
      statusTitle = 'Проверяем судоку'
      statusText = 'Определяем, есть ли ровно одно решение.'
    } else if (solver.phase === 'paused') {
      statusTitle = 'Проверка на паузе'
    } else if (solver.phase === 'timeout') {
      statusTitle = 'Проверка не завершена'
      statusText = 'Результат пока не установлен. Продолжите проверку ещё на 30 секунд.'
    } else if (solver.phase === 'error') {
      statusTitle = 'Не удалось проверить судоку'
      statusText = 'Подтвердите числа ещё раз, чтобы повторить проверку.'
    } else if (solver.phase === 'finished') {
      const unique = solver.result?.status === 'unique'
      const multiple = solver.result?.status === 'multiple'
      const invalid = solver.result?.status === 'invalid'
      statusTitle = unique
        ? 'Корректное судоку'
        : multiple
          ? 'Есть несколько решений'
          : invalid
            ? 'В исходных числах есть конфликт'
            : 'У этой задачи нет решения'
      statusText = unique
        ? 'У задачи ровно одно решение.'
        : multiple
          ? 'У задачи несколько решений.'
          : invalid
            ? 'Исправьте числа, отмеченные красным, и подтвердите ввод ещё раз.'
            : 'Проверьте исходные числа и подтвердите ввод ещё раз.'
      tone = unique ? 'success' : multiple ? 'warning' : 'danger'
    }
  }

  const phaseNumber = !hasTask ? '01' : needsConfirmation ? '02' : '03'
  return (
    <div className={`app ${keyboardOpen ? 'keyboard-open' : ''}`}>
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">
            <Grid3X3 size={23} />
          </span>
          <div className="brand-name">
            <h1>
              Sudoku<span>Master</span>
            </h1>
            <span className="app-version" aria-label={`Версия ${version}`}>
              v{version}
            </span>
          </div>
        </div>
        <nav className="header-actions" aria-label="Инструменты">
          <button
            className="icon-button help-button"
            onClick={() => openOverlay('help')}
            aria-label="Справка"
          >
            <CircleHelp size={21} />
            <span>Справка</span>
          </button>
          <details
            ref={menu}
            className="tools-menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                closeMenu()
                menu.current?.querySelector('summary')?.focus()
              }
            }}
          >
            <summary>
              <MoreHorizontal size={22} />
              <span>Ещё</span>
              <ChevronDown size={15} />
            </summary>
            <div className="menu-content">
              <button onClick={() => openOverlay('camera')}>
                <Camera size={18} />
                Сделать фото
              </button>
              <button onClick={upload}>
                <Upload size={18} />
                Загрузить фото
              </button>
              <hr />
              <button onClick={() => clear()}>
                <Pencil size={18} />
                Ввести вручную
              </button>
              {hasTask && (
                <button onClick={() => clear()}>
                  <Eraser size={18} />
                  Очистить поле
                </button>
              )}
              {hasTask && !active && locked && (
                <button
                  className="mobile-action"
                  onClick={() => {
                    closeMenu()
                    solver.reset()
                  }}
                  aria-label="Вернуться к исходной задаче"
                >
                  <RotateCcw size={18} />
                  Изменить задачу
                </button>
              )}
              <span className="menu-label">Примеры</span>
              <button onClick={() => loadExample(9)}>
                9 × 9 <span>Классика</span>
              </button>
              <button onClick={() => loadExample(16)}>
                16 × 16 <span>Из журнала</span>
              </button>
              {(Object.keys(layouts) as LayoutName[]).map((layout) => (
                <button key={layout} onClick={() => loadComposite(layout)}>
                  {layouts[layout].name}
                </button>
              ))}
              <hr />
              <button onClick={() => openOverlay('settings')}>
                <Settings2 size={18} />
                Настройки решения
              </button>
            </div>
          </details>
        </nav>
      </header>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Загрузить фотографию судоку"
        onChange={(event) => {
          acceptFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <main className={`workspace ${zoom ? 'is-zoomed' : ''}`} aria-label="Рабочий стол судоку">
        <section
          className={`board-panel ${hasTask ? 'has-task' : ''} ${puzzle.boards ? 'has-composition' : ''} ${zoom ? 'zoomed-board' : ''} ${dragging ? 'dragging' : ''}`}
          aria-label="Задача"
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
              setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            acceptFile(event.dataTransfer.files[0])
          }}
        >
          <div className="board-toolbar">
            <div className="board-heading">
              <div className="board-title">
                <h2>{puzzleTitle(puzzle)}</h2>
                <span title={name}>{name}</span>
              </div>
              <div className="board-tools">
                {review && (
                  <button
                    className="icon-button photo-toggle"
                    aria-label={view === 'photo' ? 'Вернуться к полю' : 'Показать фото'}
                    aria-pressed={view === 'photo'}
                    aria-controls="sudoku-board-view"
                    onClick={togglePhoto}
                  >
                    {view === 'photo' ? <Grid3X3 size={20} /> : <FileImage size={20} />}
                    <span>{view === 'photo' ? 'Поле' : 'Фото'}</span>
                  </button>
                )}
                <button
                  className="icon-button"
                  onClick={() => setZoom(!zoom)}
                  aria-label={zoom ? 'Уменьшить поле' : 'Увеличить поле'}
                >
                  {zoom ? <X size={21} /> : <Maximize2 size={20} />}
                </button>
              </div>
            </div>
            {hasTask && <ScaleControls value={scale} onChange={setScale} />}
          </div>
          <div className="board-scroll" id="sudoku-board-view" ref={boardView}>
            <div className="board-stage">
              <PuzzleBoard
                scale={scale}
                photos={review?.photos}
                showPhoto={view === 'photo' && !!review}
                puzzle={puzzle}
                values={values}
                selected={selected}
                locked={locked || !hasTask}
                conflicts={conflicts}
                uncertain={uncertain}
                kinds={solver.kinds}
                latest={solver.latest}
                solved={solved}
                onSelect={selectCell}
                onChange={change}
              />
              {!hasTask && (
                <div className="empty-board-hint" aria-hidden="true">
                  <Camera size={28} />
                  <span>Здесь появится ваша задача</span>
                </div>
              )}
              {dragging && (
                <div className="drop-overlay">
                  <Upload size={32} />
                  Отпустите фотографию здесь
                </div>
              )}
            </div>
          </div>
          <div className="board-meta">
            <span>
              {hasTask && <span className="compact-label">{puzzleTitle(puzzle)} · </span>}
              {hasTask ? `${filled} / ${puzzle.givens.length} клеток` : 'Судоку 9×9, 16×16 и связанные поля'}
            </span>
            {hasTask && (
              <button className="text-button" onClick={() => openOverlay('settings')}>
                Подробности
              </button>
            )}
          </div>
          {inspecting && selected !== null && !locked && (
            <div className="cell-tools">
              {review && (
                <div
                  className="cell-crop"
                  role="img"
                  aria-label="Фрагмент выбранной клетки на фотографии"
                  style={cropStyle}
                />
              )}
              <span>{selectedCellLabel}</span>
              <button className="text-button" onClick={() => openOverlay('editor')}>
                <Pencil size={17} />
                Правка
              </button>
            </div>
          )}
        </section>
        <aside className="workflow-dock" ref={dock}>
          <section
            className={`solve-panel ${tone} ${checkOnly ? 'check-mode' : ''} ${!hasTask ? 'is-empty' : ''} ${needsChecking && uncertain.size ? 'has-review-cells' : ''}`}
            aria-label="Проверка и решение"
          >
            <div className="step-label">
              <span>{phaseNumber}</span>
              {!hasTask
                ? 'Фотография'
                : needsConfirmation
                  ? review
                    ? 'Проверка чисел'
                    : 'Ввод чисел'
                  : checkOnly
                    ? 'Проверка судоку'
                    : 'Решение'}
            </div>
            <div className="solve-status" role="status" aria-live="polite" aria-atomic="true">
              <div className="status-title">
                {tone === 'success' ? (
                  <CheckCircle2 size={22} />
                ) : tone === 'danger' ? (
                  <XCircle size={22} />
                ) : tone === 'warning' && !active ? (
                  <AlertTriangle size={22} />
                ) : active ? (
                  <LoaderCircle
                    size={21}
                    className={solver.phase === 'running' || solver.phase === 'checking' ? 'spin' : ''}
                  />
                ) : null}
                <h2>{statusTitle}</h2>
              </div>
              <p id="solve-status-text">{statusText}</p>
              {needsChecking && uncertain.size > 0 && (
                <p className="review-count">Требуют внимания: {uncertain.size}</p>
              )}
            </div>
            {needsChecking && uncertain.size > 0 && (
              <button
                className="text-button next-uncertain"
                onClick={nextUncertain}
                aria-label={`Следующая сомнительная клетка, осталось ${uncertain.size}`}
                title={`Проверить сомнительные клетки: ${uncertain.size}`}
              >
                <span className="full-label">Следующая сомнительная клетка</span>
                <span className="compact-label" aria-hidden="true">
                  <ListChecks size={23} />
                  <span className="review-badge">{uncertain.size}</span>
                </span>
              </button>
            )}
            <div className={`solve-controls ${needsConfirmation ? 'needs-confirmation' : ''}`}>
              {!hasTask ? (
                <>
                  <button className="button primary" onClick={() => openOverlay('camera')}>
                    <Camera size={21} />
                    Сделать фото
                  </button>
                  <button className="button secondary" onClick={upload}>
                    <Upload size={20} />
                    Загрузить фото
                  </button>
                </>
              ) : (
                <>
                  {needsConfirmation && (
                    <button
                      className="button primary confirm-button"
                      disabled={locked || !hasNumbers}
                      aria-label={review ? 'Я проверил(а) числа по фотографии' : 'Я заполнил числа'}
                      aria-describedby="solve-status-text"
                      onClick={confirmNumbers}
                    >
                      <CheckCircle2 size={21} />
                      {review ? (
                        <>
                          <span className="full-label">Я проверил(а) числа по фотографии</span>
                          <span className="compact-label" aria-hidden="true">
                            Я проверил(а) числа
                          </span>
                        </>
                      ) : (
                        <span>Я заполнил числа</span>
                      )}
                    </button>
                  )}
                  {(!locked || checkOnly || solver.phase === 'finished') && !solved && (
                    <button
                      ref={solveButton}
                      className={`button ${needsConfirmation ? 'secondary' : 'primary'} solve-button`}
                      disabled={!ready}
                      aria-describedby="solve-status-text"
                      onClick={() => {
                        setView('grid')
                        setInspecting(false)
                        solver.start()
                      }}
                    >
                      <Play size={19} fill="currentColor" />
                      {solver.phase === 'finished' && !checkOnly ? 'Запустить ещё раз' : 'Решить судоку'}
                    </button>
                  )}
                  {!checkOnly && ['running', 'checking'].includes(solver.phase) && (
                    <button className="button primary" onClick={solver.pause}>
                      <Pause size={20} />
                      Пауза
                    </button>
                  )}
                  {['paused', 'timeout'].includes(solver.phase) && (
                    <button className="button primary" onClick={solver.resume}>
                      <Play size={20} />
                      Продолжить
                    </button>
                  )}
                  {solved && (
                    <button
                      className="button download-button"
                      disabled={exporting}
                      onClick={() => void download()}
                    >
                      <Download size={20} />
                      {exporting ? 'Сохраняем…' : 'Сохранить решение'}
                    </button>
                  )}
                  {solved && !active && (
                    <button className="button primary" onClick={() => openOverlay('source')}>
                      <Plus size={20} />
                      Новая задача
                    </button>
                  )}
                  {active && (
                    <button className="button secondary stop-button" onClick={stop}>
                      <Square size={17} />
                      Остановить
                    </button>
                  )}
                </>
              )}
            </div>
            {hasTask && (
              <div className="workflow-secondary">
                {!active && locked ? (
                  <button
                    className="text-button"
                    onClick={solver.reset}
                    aria-label="Вернуться к исходной задаче"
                  >
                    <RotateCcw size={17} />
                    Изменить задачу
                  </button>
                ) : (
                  <button className="text-button" onClick={() => openOverlay('settings')}>
                    <Settings2 size={17} />
                    <span>
                      {solver.speed === 'fast'
                        ? 'Быстро'
                        : solver.speed === 'normal'
                          ? 'Обычная скорость'
                          : 'Не спеша'}
                    </span>
                  </button>
                )}
                {!active && !solved && (
                  <button className="text-button" onClick={() => openOverlay('source')}>
                    Новое фото
                  </button>
                )}
              </div>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </section>
          <p className="privacy-note">
            <ShieldCheck size={16} />
            Фотографии остаются на устройстве
          </p>
        </aside>
      </main>
      {overlay === 'camera' && (
        <CameraDialog
          onClose={() => setOverlay(null)}
          onUpload={upload}
          onCapture={(next) => {
            setOverlay(null)
            acceptFile(next)
          }}
        />
      )}
      {overlay === 'source' && (
        <Dialog title="Новая задача" onClose={() => setOverlay(null)}>
          <p className="dialog-description">Сделайте снимок судоку или выберите фотографию.</p>
          <div className="source-actions">
            <button className="button primary" onClick={() => setOverlay('camera')}>
              <Camera size={20} />
              Сделать фото
            </button>
            <button className="button secondary" onClick={upload}>
              <Upload size={20} />
              Загрузить фото
            </button>
          </div>
        </Dialog>
      )}
      {overlay === 'settings' && (
        <Dialog title="Настройки решения" onClose={() => setOverlay(null)}>
          <label className="setting-row">
            <span>Скорость решения</span>
            <select
              aria-label="Скорость решения"
              value={solver.speed}
              onChange={(event) => solver.setSpeed(event.target.value as Speed)}
            >
              <option value="fast">Быстро</option>
              <option value="normal">Обычная скорость</option>
              <option value="slow">Не спеша</option>
            </select>
          </label>
          <p className="setting-note">
            Быстро — без задержек. Выберите более медленный режим, чтобы наблюдать отдельные ходы.
          </p>
          {!review && !locked && (
            <label className="setting-row">
              <span>Размер нового поля</span>
              <select
                aria-label="Размер нового поля"
                value={puzzle.size}
                onChange={(event) => clear(Number(event.target.value) as BoardSize, false)}
              >
                <option value={9}>9 × 9</option>
                <option value={16}>16 × 16</option>
              </select>
            </label>
          )}
          <div className="board-legend">
            <span>
              <i className="legend-given" />
              Исходные числа
            </span>
            <span>
              <i className="legend-found" />
              Найденные числа
            </span>
            <span>
              <i className="legend-guess" />
              Предположения
            </span>
          </div>
          <div className="solver-stats">
            <span>
              Логические выводы <b>{solver.stats.deductions}</b>
            </span>
            <span>
              Предположения <b>{solver.stats.guesses}</b>
            </span>
            <span>
              Возвраты <b>{solver.stats.backtracks}</b>
            </span>
            <span>
              Вычисления <b>{(solver.stats.elapsedMs / 1000).toFixed(2)} с</b>
            </span>
          </div>
          {solver.reason && <p className="setting-note">{solver.reason}</p>}
        </Dialog>
      )}
      {overlay === 'editor' && selected !== null && (
        <Dialog title="Правка клетки" className="cell-editor" onClose={() => setOverlay(null)}>
          <div className="cell-editor-body" ref={editorBody}>
            <div className="cell-comparison">
              <div className="editor-cell-samples">
                {review && (
                  <div
                    className="cell-crop large"
                    role="img"
                    aria-label="Фрагмент выбранной клетки на фотографии"
                    style={cropStyle}
                  />
                )}
                <div
                  className="editor-current-value"
                  role="img"
                  aria-label={values[selected] ? `Число в поле: ${values[selected]}` : 'Клетка в поле пустая'}
                >
                  {values[selected] || ''}
                </div>
              </div>
              <div className="editor-cell-info">
                <p className="editor-cell-label">{selectedCellLabel}</p>
                {review && <small>Сверьте число с фотографией</small>}
              </div>
            </div>
            <div className={`number-pad pad-${puzzle.size}`} role="group" aria-label="Число в клетке">
              {Array.from({ length: puzzle.size }, (_, i) => (
                <button
                  key={i}
                  disabled={locked}
                  onClick={() => change(selected, i + 1)}
                  aria-label={`Ввести ${i + 1}`}
                  aria-pressed={values[selected] === i + 1}
                >
                  {i + 1}
                </button>
              ))}
              <button
                className="number-pad-empty"
                disabled={locked}
                onClick={() => change(selected, 0)}
                aria-pressed={values[selected] === 0}
              >
                Пусто
              </button>
            </div>
          </div>
          <div className="cell-editor-footer">
            <div className="editor-progress-row">
              <div className="editor-progress-options">
                <p className="editor-progress" role="status" aria-live="polite" aria-atomic="true">
                  {editorMode === 'all'
                    ? `Клетка ${selected + 1} из ${puzzle.givens.length}`
                    : editorPosition < 0
                      ? `Сомнительных: ${editorTotal}`
                      : `Сомнительная ${editorPosition + 1} из ${editorTotal}`}
                </p>
                {review && (editorMode === 'uncertain' || uncertain.size > 0) && (
                  <button
                    className="text-button editor-mode"
                    onClick={() =>
                      configureEditor(selected, editorMode === 'uncertain' ? 'all' : 'uncertain', true)
                    }
                    disabled={locked}
                  >
                    {editorMode === 'uncertain' ? 'Все клетки' : 'Только сомнительные'}
                  </button>
                )}
              </div>
              <button
                className={`button ${editorMode === 'all' && editorLast ? 'primary' : 'secondary'}`}
                onClick={() => {
                  confirmCell(selected)
                  setOverlay(null)
                }}
              >
                <Check size={19} />
                Готово
              </button>
            </div>
            <nav
              className="editor-navigation"
              aria-label={
                editorMode === 'uncertain' ? 'Проверка сомнительных клеток' : 'Проверка клеток по порядку'
              }
            >
              <button
                className="button secondary"
                disabled={editorPosition <= 0 || locked}
                aria-label="Предыдущая клетка"
                onClick={() =>
                  selectCell(editorMode === 'all' ? selected - 1 : editorCells[editorPosition - 1])
                }
              >
                <ChevronLeft size={19} />
                Назад
              </button>
              <button
                className="button primary"
                disabled={(editorMode === 'all' && editorLast) || locked}
                onClick={nextEditorCell}
              >
                {editorMode === 'uncertain' && editorLast ? 'Завершить проверку' : 'Проверено, дальше'}
                {editorMode === 'uncertain' && editorLast ? <Check size={19} /> : <ChevronRight size={19} />}
              </button>
            </nav>
          </div>
        </Dialog>
      )}
      {overlay === 'help' && (
        <Dialog title="Справка" onClose={() => setOverlay(null)}>
          <div className="help-content">
            <h3>От фотографии к решению</h3>
            <ol>
              <li>Сделайте или загрузите фото судоку.</li>
              <li>Проверьте найденные поля и их пересечения, затем распознайте числа.</li>
              <li>Сверьте числа с оригиналом, подтвердите проверку и запустите решение.</li>
            </ol>
            <h3>Автоматическая проверка</h3>
            <p>
              После «Я проверил(а) числа по фотографии» или «Я заполнил числа» автоматически проверяем судоку.
              Зелёный статус — одно решение, красный — конфликт или нет решения, жёлтый — несколько решений.
              Исходные клетки остаются незаполненными. Чтобы увидеть ответ, отдельно нажмите «Решить судоку».
              Изменение любого числа требует повторного подтверждения.
            </p>
            <h3>Что можно решать</h3>
            <p>
              Классические судоку 9×9 и 16×16, а также связанные поля 9×9 с общими блоками 3×3: два поля,
              Самурай, восемь полей и другие составные схемы. Общие клетки решаются одновременно для всех
              полей.
            </p>
            <h3>Исправление чисел</h3>
            <p>
              Нажмите на клетку, чтобы изменить число. «Правка» открывает фрагмент фотографии и цифровые
              кнопки. Стрелки перемещают выделение, Backspace и Delete очищают ввод. Большое поле можно
              увеличить или уменьшить от 25% до 200%. «Фото / Поле» сохраняет масштаб, прокрутку и выбранное
              поле, чтобы числа было удобно сравнивать.
            </p>
            <p>
              В окне правки текущее число выделено синим. «Пусто» в том же блоке очищает клетку. «Проверено,
              дальше» подтверждает клетку и переходит к следующей по строкам, включая пустые. «Назад»
              возвращает к предыдущей клетке. Общие клетки составных полей проверяются один раз. Изменения
              сохраняются сразу; «Готово» подтверждает текущую клетку и закрывает окно.
            </p>
            <h3>Рукописные заметки</h3>
            <p>
              По умолчанию распознаются числа любого цвета. Если задача уже заполнена от руки, перед
              распознаванием выберите «Только печатные», чтобы убрать пометки. Перед решением сверьте числа с
              фотографией. Красным отмечены конфликты, янтарным — сомнительные клетки.
            </p>
            <h3>Ваши фотографии</h3>
            <p>
              Камера, распознавание и решение работают в браузере. Снимки никуда не отправляются и не
              сохраняются после закрытия вкладки. Для съёмки нужен HTTPS или localhost и разрешение камеры.
            </p>
            <h3>Дополнительные инструменты</h3>
            <p>
              В меню «Ещё» находятся примеры, ручной ввод и настройки скорости. JPG, PNG и WebP до 25 МБ. При
              первом распознавании браузер загружает необходимые модули с этого сайта.
            </p>
          </div>
        </Dialog>
      )}
      {file && (
        <PhotoDialog
          file={file}
          initialSize={puzzle.size}
          onClose={() => setFile(null)}
          onRecognized={recognized}
        />
      )}
    </div>
  )
}
