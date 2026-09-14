import { useId, useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { cellLabel, topology } from '../core/topology'
import type { PlacementKind, PuzzleDefinition, RecognitionResult } from '../core/types'

export interface BoardProps {
  photos?: RecognitionResult['photos']
  showPhoto?: boolean
  focusBoard?: number | null
  puzzle: PuzzleDefinition
  values: number[]
  selected: number | null
  locked: boolean
  conflicts: Set<number>
  uncertain: Set<number>
  kinds: Record<number, PlacementKind>
  latest: number | null
  solved: boolean
  onSelect: (index: number) => void
  onChange: (index: number, value: number) => void
}
export function Board({
  puzzle,
  values,
  selected,
  locked,
  conflicts,
  uncertain,
  kinds,
  latest,
  solved,
  onSelect,
  onChange,
  focusBoard = null,
  photos,
  showPhoto = false,
}: BoardProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const photoId = useId()
  const { size, boxSize } = puzzle
  const geometry = useMemo(() => topology(puzzle), [puzzle])
  const focus = focusBoard === null ? null : geometry.boards[focusBoard]
  const indices = focus ? focus.cells : values.map((_, i) => i)
  const columns = focus ? size : geometry.width
  const rows = focus ? size : geometry.height
  const relatedCells = new Set(
    selected === null ? [] : geometry.cellUnits[selected]?.flatMap((u) => geometry.units[u]),
  )
  const currentTab = selected !== null && indices.includes(selected) ? selected : indices[0]
  const keyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const deltas: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    }
    if (event.key in deltas) {
      event.preventDefault()
      const [dx, dy] = deltas[event.key]
      const cell = geometry.cells[index]
      let x = cell.x,
        y = cell.y
      for (let k = 0; k < geometry.width * geometry.height; k++) {
        x = (x + dx + geometry.width) % geometry.width
        y = (y + dy + geometry.height) % geometry.height
        const next = geometry.at.get(`${x},${y}`)
        if (next !== undefined && indices.includes(next)) {
          inputs.current[next]?.focus()
          inputs.current[next]?.select()
          break
        }
      }
    }
  }

  return (
    <>
      {photos && (
        <svg className="photo-definitions" width="0" height="0" aria-hidden="true">
          <defs>
            {photos.map((photo, index) => (
              <image
                key={index}
                id={`${photoId}-photo-${index}`}
                href={photo.imageUrl}
                width={photo.width}
                height={photo.height}
              />
            ))}
          </defs>
        </svg>
      )}
      <div
        className={`sudoku-grid size-${size} ${puzzle.boards ? 'composite-grid' : ''} ${solved ? 'is-solved' : ''} ${showPhoto ? 'photo-grid' : ''}`}
        role="grid"
        aria-readonly={locked || showPhoto}
        aria-label={
          showPhoto
            ? 'Фотография судоку для проверки'
            : puzzle.boards
              ? focusBoard === null
                ? `Составное судоку из ${geometry.boards.length} полей`
                : `Поле ${focusBoard + 1} из ${geometry.boards.length}`
              : `Поле судоку ${size} на ${size}`
        }
        aria-rowcount={rows}
        aria-colcount={columns}
        style={{ '--size': columns, aspectRatio: `${columns}/${rows}` } as CSSProperties}
      >
        {indices.map((index) => {
          const value = values[index],
            position = geometry.cells[index]
          const r = position.y - (focus?.y ?? 0),
            c = position.x - (focus?.x ?? 0)
          const active = selected === index
          const same = selected !== null && value > 0 && values[selected] === value
          const related = relatedCells.has(index)
          // A shared cell always uses the same source board, including when the
          // user switches between the overview and either overlapping board.
          const owner = position.boards[0]
          const photo = photos?.[owner]
          const sourceBoard = geometry.boards[owner]
          const rect = photo?.rects[(position.y - sourceBoard.y) * size + position.x - sourceBoard.x]
          return (
            <div
              key={index}
              role="gridcell"
              data-cell-id={index}
              aria-rowindex={r + 1}
              aria-colindex={c + 1}
              style={
                puzzle.boards
                  ? {
                      gridColumn: c + 1,
                      gridRow: r + 1,
                      borderRight: (c + 1) % boxSize === 0 ? '2px solid #7c89a0' : '1px solid #dce2ed',
                      borderBottom: (r + 1) % boxSize === 0 ? '2px solid #7c89a0' : '1px solid #dce2ed',
                      borderLeft: (focus ? c === 0 : !geometry.at.has(`${position.x - 1},${position.y}`))
                        ? '2px solid #43536e'
                        : undefined,
                      borderTop: (focus ? r === 0 : !geometry.at.has(`${position.x},${position.y - 1}`))
                        ? '2px solid #43536e'
                        : undefined,
                    }
                  : undefined
              }
              className={[
                'cell',
                puzzle.givens[index] ? 'given' : 'found',
                active && 'selected',
                same && 'same',
                related && 'related',
                conflicts.has(index) && 'conflict',
                uncertain.has(index) && !solved && 'uncertain',
                kinds[index] === 'guess' && !solved && 'guess',
                latest === index && 'latest',
                (c + 1) % boxSize === 0 && c + 1 !== size && 'box-right',
                (r + 1) % boxSize === 0 && r + 1 !== size && 'box-bottom',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                ref={(el) => {
                  inputs.current[index] = el
                }}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={size === 9 ? 1 : 2}
                value={value || ''}
                readOnly={locked || showPhoto}
                aria-hidden={showPhoto || undefined}
                aria-label={cellLabel(puzzle, index)}
                aria-invalid={conflicts.has(index)}
                tabIndex={!locked && !showPhoto && index === currentTab ? 0 : -1}
                onFocus={(event) => {
                  onSelect(index)
                  event.target.select()
                }}
                onKeyDown={(event) => keyDown(event, index)}
                onChange={(event) => {
                  const raw = event.target.value
                  if (/^\d{0,2}$/.test(raw) && Number(raw) <= size) onChange(index, Number(raw))
                }}
              />
              {photo && rect && (
                <svg
                  className="cell-photo"
                  viewBox={`${rect.x} ${rect.y} ${rect.w} ${rect.h}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <use href={`#${photoId}-photo-${owner}`} />
                </svg>
              )}
              {uncertain.has(index) && !solved && <span className="cell-marker" aria-hidden="true" />}
            </div>
          )
        })}
      </div>
    </>
  )
}
