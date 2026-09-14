import { useEffect, useMemo, useState } from 'react'
import { BoardViewport } from './BoardViewport'
import type { BoardViewportProps } from './BoardViewport'
import { topology } from '../core/topology'

export function CompositeBoard(props: BoardViewportProps) {
  const geometry = useMemo(() => topology(props.puzzle), [props.puzzle])
  const [focus, setFocus] = useState<number | null>(() =>
    window.matchMedia('(max-width: 900px)').matches ? 0 : null,
  )
  useEffect(() => {
    if (props.selected !== null && focus !== null && !geometry.boards[focus]?.cells.includes(props.selected))
      setFocus(geometry.cells[props.selected]?.boards[0] ?? 0)
  }, [props.selected, geometry, focus])
  const choose = (value: number | null) => {
    setFocus(value)
    if (value !== null) props.onSelect(geometry.boards[value].cells[0])
  }
  const related = props.selected === null ? [] : (geometry.cells[props.selected]?.boards ?? [])
  return (
    <div className="composite-workspace">
      <nav className="composition-nav" aria-label="Навигация по составному судоку">
        <svg
          className="composition-map"
          viewBox={`-1 -1 ${geometry.width + 2} ${geometry.height + 2}`}
          aria-label="Карта полей"
        >
          {geometry.boards.map((b, i) => (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`Перейти к полю ${i + 1}`}
              aria-pressed={focus === i}
              onClick={() => choose(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  choose(i)
                }
              }}
            >
              <rect
                x={b.x}
                y={b.y}
                width={9}
                height={9}
                rx=".4"
                fill={focus === i ? '#dce7ff' : '#f4f6fa'}
                stroke={related.includes(i) ? '#2457d6' : '#929fb3'}
                strokeWidth=".35"
              />
              <text
                x={b.x + 4.5}
                y={b.y + 4.9}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="5.5"
                fill="#172033"
              >
                {i + 1}
              </text>
              {b.cells.some((c) => props.uncertain.has(c)) && !props.solved && (
                <circle cx={b.x + 7} cy={b.y + 2} r=".65" fill="#b97a06" />
              )}
            </g>
          ))}
        </svg>
        <div className="composition-controls">
          <label>
            Крупно
            <select
              aria-label="Выбрать поле"
              value={focus ?? 'all'}
              onChange={(e) => choose(e.target.value === 'all' ? null : Number(e.target.value))}
            >
              <option value="all">Вся задача</option>
              {geometry.boards.map((_, i) => (
                <option value={i} key={i}>
                  Поле {i + 1} из {geometry.boards.length}
                </option>
              ))}
            </select>
          </label>
          {focus !== null && (
            <button className="text-button" onClick={() => choose(null)}>
              Вся задача
            </button>
          )}
        </div>
      </nav>
      <BoardViewport {...props} focusBoard={focus} />
    </div>
  )
}
