import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Download,
  Eraser,
  FileImage,
  Grid3X3,
  ImagePlus,
  LockKeyhole,
  Maximize2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { Board } from './components/Board'
import { PhotoDialog } from './components/PhotoDialog'
import { validatePuzzle } from './core/solver'
import { emptyPuzzle } from './core/types'
import type { BoardSize, RecognitionResult } from './core/types'
import { getExample } from './data/examples'
import { useSolver } from './hooks/useSolver'
import type { Speed } from './hooks/useSolver'
import { downloadBlob, solutionImage } from './services/export'

export default function App() {
  const [puzzle, setPuzzle] = useState(() => getExample(9))
  const [name, setName] = useState('Классический пример')
  const [selected, setSelected] = useState<number | null>(0)
  const [file, setFile] = useState<File | null>(null)
  const [review, setReview] = useState<RecognitionResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [uncertain, setUncertain] = useState<Set<number>>(new Set())
  const [view, setView] = useState<'grid' | 'photo'>('grid')
  const [zoom, setZoom] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const solveButton = useRef<HTMLButtonElement>(null)
  const solver = useSolver(puzzle)
  const validation = useMemo(() => validatePuzzle(puzzle), [puzzle])
  const conflicts = useMemo(() => new Set(validation.conflicts), [validation])
  const locked = !['idle', 'error'].includes(solver.phase)
  const active = ['running', 'checking', 'paused', 'timeout'].includes(solver.phase)
  const values = solver.values ?? puzzle.givens
  const filled = values.filter(Boolean).length
  const ready = validation.valid && (!review || confirmed)
  const needsChecking = !!review && !confirmed
  const solved = solver.hasSolution
  useEffect(() => {
    if (confirmed) solveButton.current?.focus({ preventScroll: true })
  }, [confirmed])
  const selectedRect = selected !== null ? review?.cells[selected]?.rect : undefined
  const cropStyle =
    review && selectedRect
      ? {
          backgroundImage: `url(${review.imageUrl})`,
          backgroundSize: `${(review.imageSize.width / selectedRect.w) * 100}% ${(review.imageSize.height / selectedRect.h) * 100}%`,
          backgroundPosition: `${(selectedRect.x / (review.imageSize.width - selectedRect.w)) * 100}% ${(selectedRect.y / (review.imageSize.height - selectedRect.h)) * 100}%`,
        }
      : undefined
  const loadExample = (size: BoardSize) => {
    solver.reset()
    setPuzzle(getExample(size))
    setName(size === 9 ? 'Классический пример' : 'Задача из журнала')
    setReview(null)
    setConfirmed(false)
    setUncertain(new Set())
    setSelected(0)
    setError('')
    setView('grid')
  }
  const clear = (size = puzzle.size) => {
    solver.reset()
    setPuzzle(emptyPuzzle(size))
    setName('Ваша задача')
    setReview(null)
    setConfirmed(false)
    setUncertain(new Set())
    setSelected(0)
    setView('grid')
    setError('')
  }
  const change = (index: number, value: number) => {
    if (locked) return
    setPuzzle((previous) => ({
      ...previous,
      givens: previous.givens.map((v, i) => (i === index ? value : v)),
    }))
    setUncertain((previous) => {
      const next = new Set(previous)
      next.delete(index)
      return next
    })
    if (review) setConfirmed(false)
    setError('')
  }
  const acceptFile = (next: File | undefined) => {
    if (!next) return
    solver.reset()
    setFile(next)
    setError('')
  }
  const recognized = (result: RecognitionResult) => {
    setPuzzle(result.puzzle)
    setReview(result)
    setConfirmed(false)
    setUncertain(new Set(result.cells.filter((cell) => cell.needsReview).map((cell) => cell.index)))
    setName(file?.name ?? 'Задача с фотографии')
    setFile(null)
    setSelected(result.cells.find((cell) => cell.needsReview)?.index ?? 0)
    setView('grid')
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
        `SudokuMaster-${puzzle.size}x${puzzle.size}.png`,
      )
    } catch {
      setError('Не удалось сохранить изображение. Попробуйте скачать его ещё раз.')
    } finally {
      setExporting(false)
    }
  }
  let statusTitle = 'Всё готово к решению'
  let statusText = 'Можно начать с примера или ввести свою задачу.'
  let tone = 'neutral'
  if (needsChecking) {
    statusTitle = 'Сначала проверим числа'
    statusText = 'Сравните поле с фотографией, исправьте ошибки и подтвердите проверку.'
    tone = 'warning'
  } else if (review && confirmed && solver.phase === 'idle') {
    statusTitle = 'Числа проверены'
    statusText = 'Можно запускать решение.'
    tone = 'success'
  }
  if (!validation.valid) {
    statusTitle = 'В исходных числах есть конфликт'
    statusText = 'Сначала исправьте числа, отмеченные красным. Они повторяются в строке, столбце или блоке.'
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

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#" aria-label="SudokuMaster — главная">
            <span className="brand-mark">
              <Grid3X3 size={24} strokeWidth={1.6} />
            </span>
            <span>
              Sudoku<span className="brand-light">Master</span>
              <span className="beta-label">BETA</span>
            </span>
          </a>
          <nav>
            <a href="#how-it-works">
              Как это работает <ArrowDown size={13} />
            </a>
            <span className="private-badge">
              <ShieldCheck size={16} /> Без отправки фото
            </span>
          </nav>
        </div>
      </header>
      <main className="page-shell">
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span className="small-star">✦</span> МЕНЬШЕ РУТИНЫ. БОЛЬШЕ ОТКРЫТИЙ.
            </div>
            <h1>
              Ваша задача.
              <br />
              <span>Наш следующий ход.</span>
            </h1>
            <p>
              Перенесите судоку с фотографии и наблюдайте,
              <br className="desktop-break" /> как решение появляется клетка за клеткой.
            </p>
          </div>
          <div className="hero-steps" aria-label="Три шага к решению">
            <div>
              <span className="step-icon">
                <ImagePlus size={20} />
              </span>
              <span>
                <strong>Загрузите фото</strong>
                <small>Из журнала, книги или галереи</small>
              </span>
              <span className="step-index">01</span>
            </div>
            <div>
              <span className="step-icon">
                <ScanLine size={20} />
              </span>
              <span>
                <strong>Проверьте числа</strong>
                <small>Мы распознаем, вы уточняете</small>
              </span>
              <span className="step-index">02</span>
            </div>
            <div>
              <span className="step-icon">
                <Sparkles size={20} />
              </span>
              <span>
                <strong>Посмотрите решение</strong>
                <small>Сохраните готовое поле</small>
              </span>
              <span className="step-index">03</span>
            </div>
          </div>
        </section>

        <section className="workspace" aria-label="Рабочий стол судоку">
          <div className="workspace-heading">
            <div>
              <span className="workspace-dot" />
              <h2>Рабочий стол</h2>
              <span className="workspace-caption">Всё начинается с одной клетки</span>
            </div>
            <span className="supported-badge">Классическое судоку</span>
          </div>
          <div className="workspace-layout">
            <aside className="sidebar">
              <section className="panel upload-panel">
                <div className="panel-heading">
                  <span className="section-number">01</span>
                  <h3>Добавьте задачу</h3>
                </div>
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
                <button
                  className={`dropzone ${dragging ? 'dragging' : ''}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    acceptFile(event.dataTransfer.files[0])
                  }}
                >
                  <span className="upload-symbol">
                    <Upload size={26} strokeWidth={1.5} />
                  </span>
                  <strong>Загрузить фотографию</strong>
                  <span>или перетащите её сюда</span>
                  <small>JPG, PNG, WebP · до 25 МБ</small>
                </button>
                <div className="privacy-note">
                  <LockKeyhole size={14} />
                  <span>
                    Фото обрабатывается только
                    <br />
                    на вашем устройстве
                  </span>
                </div>
              </section>
              <section className="panel examples-panel">
                <div className="panel-heading">
                  <Grid3X3 size={17} />
                  <h3>Попробуйте на примере</h3>
                </div>
                <p>Без фотографии, сразу к решению.</p>
                <div className="example-buttons">
                  <button onClick={() => loadExample(9)}>
                    <span>9 × 9</span>
                    <small>Классика</small>
                    <ChevronRight size={16} />
                  </button>
                  <button onClick={() => loadExample(16)}>
                    <span>16 × 16</span>
                    <small>Из журнала</small>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </section>

              {review && (
                <section className="panel review-panel">
                  <div className="panel-heading">
                    <FileImage size={17} />
                    <h3>Оригинал фотографии</h3>
                  </div>
                  <button
                    className="source-thumbnail"
                    onClick={() => setView(view === 'photo' ? 'grid' : 'photo')}
                    aria-label="Показать оригинал фотографии"
                  >
                    <img src={review.imageUrl} alt="Выровненное исходное судоку" />
                    <span>
                      <Maximize2 size={14} /> Посмотреть целиком
                    </span>
                  </button>
                  {selected !== null && (
                    <div className="cell-comparison">
                      <div
                        className="cell-crop"
                        role="img"
                        aria-label="Фрагмент выбранной клетки на фотографии"
                        style={cropStyle}
                      />
                      <div>
                        <strong>
                          Строка {Math.floor(selected / puzzle.size) + 1}, столбец{' '}
                          {(selected % puzzle.size) + 1}
                        </strong>
                        <small>Сверьте с печатным числом</small>
                        {uncertain.has(selected) && (
                          <button
                            className="text-button"
                            onClick={() =>
                              setUncertain((previous) => {
                                const next = new Set(previous)
                                next.delete(selected)
                                return next
                              })
                            }
                          >
                            <Check size={13} /> Здесь всё верно
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="panel entry-panel">
                <div className="panel-heading">
                  <Pencil size={16} />
                  <h3>{locked ? 'Исходная задача' : 'Можно ввести вручную'}</h3>
                </div>
                <p>
                  {locked
                    ? 'Чтобы исправить числа, вернитесь к редактированию.'
                    : selected === null
                      ? 'Выберите клетку и добавьте число.'
                      : `Клетка: строка ${Math.floor(selected / puzzle.size) + 1}, столбец ${(selected % puzzle.size) + 1}`}
                </p>
                {!locked && (
                  <>
                    <div className={`number-pad pad-${puzzle.size}`}>
                      {Array.from({ length: puzzle.size }, (_, i) => (
                        <button
                          key={i}
                          disabled={selected === null}
                          onClick={() => selected !== null && change(selected, i + 1)}
                          aria-label={`Ввести ${i + 1}`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <div className="entry-actions">
                      <button
                        className="text-button"
                        disabled={selected === null}
                        onClick={() => selected !== null && change(selected, 0)}
                      >
                        <Eraser size={14} /> Стереть число
                      </button>
                      <button className="text-button muted" onClick={() => clear()}>
                        Очистить поле
                      </button>
                    </div>
                  </>
                )}
                {locked && (
                  <button className="button secondary full-width" onClick={solver.reset}>
                    <Pencil size={15} /> Изменить задачу
                  </button>
                )}
              </section>
            </aside>

            <section className={`panel board-panel ${zoom ? 'zoomed-board' : ''}`}>
              <div className="board-heading">
                <div>
                  <h3>
                    {puzzle.size} × {puzzle.size} <span> / </span>{' '}
                    {puzzle.size === 9 ? 'Классика' : 'Большое поле'}
                  </h3>
                  <p title={name}>{name}</p>
                </div>
                <div className="size-selector" aria-label="Размер нового поля">
                  <button
                    aria-pressed={puzzle.size === 9}
                    onClick={() => {
                      if (puzzle.size !== 9) clear(9)
                    }}
                  >
                    9 × 9
                  </button>
                  <button
                    aria-pressed={puzzle.size === 16}
                    onClick={() => {
                      if (puzzle.size !== 16) clear(16)
                    }}
                  >
                    16 × 16
                  </button>
                </div>
              </div>
              <div className="board-toolbar">
                <span>
                  <span className={active ? 'live-dot' : 'tiny-dot'} />
                  {solved
                    ? 'Решение найдено'
                    : active
                      ? 'Живой ход решения'
                      : 'Нажмите на клетку, чтобы изменить число'}
                </span>
                <button
                  className="icon-button"
                  onClick={() => setZoom(!zoom)}
                  aria-label={zoom ? 'Уменьшить поле' : 'Увеличить поле'}
                >
                  {zoom ? <X size={17} /> : <Maximize2 size={16} />}
                </button>
              </div>
              <div className="board-scroll" id="sudoku-board-view">
                <div className="board-stage">
                  {view === 'photo' && review ? (
                    <img
                      className="original-board"
                      src={review.imageUrl}
                      alt="Оригинал судоку для проверки"
                    />
                  ) : (
                    <Board
                      puzzle={puzzle}
                      values={values}
                      selected={selected}
                      locked={locked}
                      conflicts={conflicts}
                      uncertain={uncertain}
                      kinds={solver.kinds}
                      latest={solver.latest}
                      solved={solved}
                      onSelect={setSelected}
                      onChange={change}
                    />
                  )}
                </div>
              </div>
              <div className="board-legend">
                <span>
                  <i className="legend-given" /> Исходные
                </span>
                <span>
                  <i className="legend-found" /> Найденные
                </span>
                <span>
                  <i className="legend-guess" /> Гипотеза
                </span>
                <span className="filled-count">
                  {filled} / {puzzle.size * puzzle.size} клеток
                </span>
              </div>
              <section className={`solve-panel ${tone}`} aria-label="Проверка и решение">
                <div className="solve-status" role="status" aria-live="polite" aria-atomic="true">
                  <span className="status-icon">
                    {tone === 'success' ? (
                      <CheckCircle2 size={21} />
                    ) : tone === 'danger' || tone === 'warning' ? (
                      <CircleHelp size={21} />
                    ) : (
                      <Sparkles size={21} />
                    )}
                  </span>
                  <div>
                    <strong>{statusTitle}</strong>
                    <p id="solve-status-text">{statusText}</p>
                    {needsChecking && uncertain.size > 0 && (
                      <p className="review-count">Клеток, требующих внимания: {uncertain.size}</p>
                    )}
                  </div>
                </div>
                {review && (
                  <div className="review-tools">
                    <button
                      className="text-button photo-toggle"
                      aria-controls="sudoku-board-view"
                      aria-pressed={view === 'photo'}
                      onClick={() => setView(view === 'photo' ? 'grid' : 'photo')}
                    >
                      {view === 'photo' ? <Grid3X3 size={18} /> : <FileImage size={18} />}
                      {view === 'photo' ? 'Вернуться к полю' : 'Показать фото'}
                    </button>
                  </div>
                )}
                <div className={`solve-controls ${needsChecking ? 'needs-confirmation' : ''}`}>
                  {needsChecking && (
                    <button
                      className="button primary confirm-button"
                      disabled={locked || !validation.valid}
                      aria-describedby="solve-status-text"
                      onClick={() => {
                        setConfirmed(true)
                        setUncertain(new Set())
                      }}
                    >
                      <CheckCircle2 size={21} />
                      <span>Я проверил(а) числа по фотографии</span>
                    </button>
                  )}
                  {(!locked || solver.phase === 'finished') && !solved && (
                    <button
                      ref={solveButton}
                      className={`button ${needsChecking ? 'secondary' : 'primary'} solve-button`}
                      disabled={!ready}
                      aria-describedby="solve-status-text"
                      onClick={() => {
                        setView('grid')
                        solver.start()
                      }}
                    >
                      <Play size={17} fill="currentColor" />{' '}
                      {solver.phase === 'finished' ? 'Запустить ещё раз' : 'Решить судоку'}
                      <ArrowRight size={18} />
                    </button>
                  )}
                  {['running', 'checking'].includes(solver.phase) && (
                    <button className="button primary" onClick={solver.pause}>
                      <Pause size={17} /> Пауза
                    </button>
                  )}
                  {['paused', 'timeout'].includes(solver.phase) && (
                    <button className="button primary" onClick={solver.resume}>
                      <Play size={17} /> Продолжить
                    </button>
                  )}
                  {active && (
                    <button className="button secondary stop-button" onClick={solver.reset}>
                      <Square size={14} /> Остановить
                    </button>
                  )}
                  {solved && (
                    <button
                      className="button primary download-button"
                      disabled={exporting}
                      onClick={() => void download()}
                    >
                      <Download size={18} /> {exporting ? 'Сохраняем…' : 'Скачать PNG'}
                    </button>
                  )}
                  {!active && locked && (
                    <button
                      className="button secondary restart-button"
                      onClick={solver.reset}
                      aria-label="Вернуться к исходной задаче"
                    >
                      <RotateCcw size={17} />
                    </button>
                  )}
                </div>
                {!solved && (
                  <div className="solve-options">
                    <label className="speed-selector">
                      <Zap size={15} />
                      <span>Скорость решения</span>
                      <select
                        aria-label="Скорость решения"
                        value={solver.speed}
                        onChange={(event) => solver.setSpeed(event.target.value as Speed)}
                      >
                        <option value="slow">Не спеша</option>
                        <option value="normal">Обычная скорость</option>
                        <option value="fast">Быстро</option>
                      </select>
                    </label>
                  </div>
                )}
                {(active || solver.phase === 'finished') && (
                  <div className="solver-stats">
                    <span>
                      Выводы <b>{solver.stats.deductions}</b>
                    </span>
                    <span>
                      Гипотезы <b>{solver.stats.guesses}</b>
                    </span>
                    <span>
                      Возвраты <b>{solver.stats.backtracks}</b>
                    </span>
                    <span>
                      Вычисления <b>{(solver.stats.elapsedMs / 1000).toFixed(2)} с</b>
                    </span>
                  </div>
                )}
              </section>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </section>
          </div>
        </section>

        <section id="how-it-works" className="about-section">
          <div>
            <span className="eyebrow">НЕМНОГО О МАГИИ ВНУТРИ</span>
            <h2>
              Правила знакомые.
              <br />
              Возможности новые.
            </h2>
          </div>
          <div className="about-copy">
            <details>
              <summary>Какие судоку умеет решать SudokuMaster?</summary>
              <p>
                Классические задачи 9×9 с блоками 3×3 и 16×16 с блоками 4×4. В каждой строке, столбце и блоке
                числа встречаются по одному разу. Программа сначала ищет логические выводы, а затем проверяет
                гипотезы и возвращается назад, если встречает противоречие.
              </p>
            </details>
            <details>
              <summary>Что делать с записями ручкой на фотографии?</summary>
              <p>
                Мы стараемся оставить печатные числа и убрать синие записи и мелкие заметки. Это не всегда
                получается точно, поэтому перед решением нужно сверить поле с фотографией. Любое число можно
                исправить или стереть. Чёрную ручку бывает трудно отличить от печати.
              </p>
            </details>
            <details>
              <summary>Куда отправляются мои фотографии?</summary>
              <p>
                Фотографии никуда не отправляются: обработка и решение выполняются в вашем браузере. При
                первом распознавании загружаются необходимые модули с этого сайта. После закрытия вкладки
                история задач не сохраняется.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>
          <Grid3X3 size={16} /> SudokuMaster
        </span>
        <span>Для тех, кто любит находить решения.</span>
        <span>
          9 × 9 <span className="footer-dot">·</span> 16 × 16
        </span>
      </footer>
      {file && (
        <PhotoDialog
          file={file}
          initialSize={puzzle.size}
          onClose={() => setFile(null)}
          onRecognized={recognized}
        />
      )}
    </>
  )
}
