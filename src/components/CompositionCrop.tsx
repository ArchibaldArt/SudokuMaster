import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { PhotoBoard, PhotoSource } from '../services/photo'
import type { Corners, Point } from '../core/types'
import { projectQuad } from '../core/photo-layout'

interface Props {
  source: PhotoSource
  boards: PhotoBoard[]
  editing: boolean
  active: number
  frame: Corners
  onSelect: (index: number) => void
  onChange: (boards: PhotoBoard[]) => void
  onFrame: (corners: Corners) => void
}
export function CompositionCrop({
  source,
  boards,
  editing,
  active,
  frame,
  onSelect,
  onChange,
  onFrame,
}: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [dragView, setDragView] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const q = active < 0 ? frame : (boards[active]?.corners ?? frame)
  const zoom = editing && active >= 0
  const x = zoom ? Math.max(0, Math.min(...q.map((p) => p.x)) - 35) : 0
  const y = zoom ? Math.max(0, Math.min(...q.map((p) => p.y)) - 35) : 0
  const w = zoom
    ? Math.min(source.image.width - x, Math.max(...q.map((p) => p.x)) - x + 35)
    : source.image.width
  const h = zoom
    ? Math.min(source.image.height - y, Math.max(...q.map((p) => p.y)) - y + 35)
    : source.image.height
  const viewport = dragView ?? { x, y, w, h }
  const update = (i: number, point: Point) => {
    const corners = q.map((p, j) =>
      i === j
        ? {
            x: Math.max(0, Math.min(source.image.width, point.x)),
            y: Math.max(0, Math.min(source.image.height, point.y)),
          }
        : p,
    ) as Corners
    if (active < 0) onFrame(corners)
    else onChange(boards.map((b, j) => (j === active ? { ...b, corners } : b)))
  }
  const move = (e: PointerEvent<SVGCircleElement>, i: number) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const matrix = svg.current?.getScreenCTM()
    if (matrix) update(i, new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()))
  }
  return (
    <svg
      ref={svg}
      viewBox={`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`}
      style={{ aspectRatio: `${viewport.w}/${viewport.h}` }}
      aria-label="Расположение связанных полей на фотографии"
    >
      <image href={source.url} width={source.image.width} height={source.image.height} />
      {boards.map((b, i) => (
        <g key={i} data-photo-board={i}>
          <polygon
            points={b.corners.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={editing && active === i ? '#2457d625' : '#2457d609'}
            stroke={active === i ? '#2457d6' : '#7198ff'}
            strokeWidth={w / 250}
          />
          {Array.from({ length: 9 }, (_, k) => ({ x: b.x + (k % 3) * 3, y: b.y + Math.floor(k / 3) * 3, k }))
            .filter((block) =>
              boards.some(
                (other, j) =>
                  j !== i &&
                  block.x >= other.x &&
                  block.x + 3 <= other.x + 9 &&
                  block.y >= other.y &&
                  block.y + 3 <= other.y + 9,
              ),
            )
            .map(({ k }) => {
              const c = k % 3,
                r = Math.floor(k / 3)
              const ps = [
                [c, r],
                [c + 1, r],
                [c + 1, r + 1],
                [c, r + 1],
              ].map(([u, v]) => projectQuad(b.corners, u / 3, v / 3))
              return (
                <polygon
                  key={k}
                  points={ps.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="#ffbb4425"
                  stroke="none"
                />
              )
            })}
          {(!zoom || i === active) && (
            <g
              role="button"
              tabIndex={0}
              aria-label={`Поправить поле ${i + 1}`}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(i)
                }
              }}
            >
              <circle
                cx={projectQuad(b.corners, 0.5, 0.5).x}
                cy={projectQuad(b.corners, 0.5, 0.5).y}
                r={w / 42}
                fill="#2457d6"
              />
              <text
                x={projectQuad(b.corners, 0.5, 0.5).x}
                y={projectQuad(b.corners, 0.5, 0.5).y}
                fill="white"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={w / 30}
              >
                {i + 1}
              </text>
            </g>
          )}
        </g>
      ))}
      {editing &&
        q.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={w / 35}
            fill="white"
            stroke="#2457d6"
            strokeWidth={w / 250}
            role="button"
            tabIndex={0}
            aria-label={`Угол ${i + 1} ${active < 0 ? 'всей схемы' : `поля ${active + 1}`}`}
            onPointerDown={(e) => {
              setDragView({ x, y, w, h })
              e.currentTarget.setPointerCapture(e.pointerId)
              e.preventDefault()
            }}
            onPointerMove={(e) => move(e, i)}
            onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
            onLostPointerCapture={() => setDragView(null)}
            onKeyDown={(e) => {
              const d: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }
              if (d[e.key]) {
                e.preventDefault()
                update(i, {
                  x: p.x + (d[e.key][0] * source.image.width) / 300,
                  y: p.y + (d[e.key][1] * source.image.height) / 300,
                })
              }
            }}
          />
        ))}
    </svg>
  )
}
