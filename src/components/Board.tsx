import { useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { PlacementKind, PuzzleDefinition } from '../core/types'

interface Props {
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
}: Props) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const { size, boxSize } = puzzle
  const keyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const deltas: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: size, ArrowUp: -size }
    if (event.key in deltas) {
      event.preventDefault()
      const next = (index + deltas[event.key] + size * size) % (size * size)
      inputs.current[next]?.focus()
      inputs.current[next]?.select()
    }
  }
  return (
    <div
      className={`sudoku-grid size-${size} ${solved ? 'is-solved' : ''}`}
      role="grid"
      aria-readonly={locked}
      aria-label={`Поле судоку ${size} на ${size}`}
      style={{ '--size': size } as CSSProperties}
    >
      {values.map((value, index) => {
        const r = Math.floor(index / size),
          c = index % size
        const active = selected === index
        const same = selected !== null && value > 0 && values[selected] === value
        const related = selected !== null && (r === Math.floor(selected / size) || c === selected % size)
        return (
          <div
            key={index}
            role="gridcell"
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
              readOnly={locked}
              aria-label={`Строка ${r + 1}, столбец ${c + 1}`}
              aria-invalid={conflicts.has(index)}
              tabIndex={!locked && index === (selected ?? 0) ? 0 : -1}
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
            {uncertain.has(index) && !solved && <span className="cell-marker" aria-hidden="true" />}
          </div>
        )
      })}
    </div>
  )
}
