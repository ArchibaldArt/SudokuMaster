import { validCorners } from './geometry'
import { topology } from './topology'
import type { Corners, GridPlacement, Point } from './types'
import type { PhotoBoard } from '../services/photo'

/** Project a position in the unit square onto a perspective quadrilateral. */
export function projectQuad(q: Corners, u: number, v: number): Point {
  const [a, b, c, d] = q
  const dx = a.x - b.x + c.x - d.x,
    dy = a.y - b.y + c.y - d.y
  const bx = b.x - c.x,
    by = b.y - c.y,
    cx = d.x - c.x,
    cy = d.y - c.y
  const det = bx * cy - cx * by
  const g = Math.abs(det) < 1e-10 ? 0 : (dx * cy - cx * dy) / det
  const h = Math.abs(det) < 1e-10 ? 0 : (bx * dy - dx * by) / det
  const z = g * u + h * v + 1
  return {
    x: ((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / z,
    y: ((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / z,
  }
}
export function photoTemplate(origins: GridPlacement[], corners: Corners): PhotoBoard[] {
  const width = Math.max(...origins.map((b) => b.x)) + 9,
    height = Math.max(...origins.map((b) => b.y)) + 9
  return origins.map((b) => ({
    ...b,
    confidence: 0,
    corners: [
      projectQuad(corners, b.x / width, b.y / height),
      projectQuad(corners, (b.x + 9) / width, b.y / height),
      projectQuad(corners, (b.x + 9) / width, (b.y + 9) / height),
      projectQuad(corners, b.x / width, (b.y + 9) / height),
    ],
  }))
}
export function photoLayoutError(boards: PhotoBoard[], width: number, height: number): string {
  let t
  try {
    t = topology({ size: 9, boxSize: 3, boards })
  } catch (e) {
    return (e as Error).message
  }
  for (let i = 0; i < boards.length; i++)
    if (!validCorners(boards[i].corners, width, height, 0.0001))
      return `Поправьте углы поля ${i + 1}: границы должны находиться на фото и не пересекаться.`
  for (const cell of t.cells)
    if (cell.boards.length > 1) {
      const projected = cell.boards.map((i) =>
        projectQuad(boards[i].corners, (cell.x - boards[i].x + 0.5) / 9, (cell.y - boards[i].y + 0.5) / 9),
      )
      for (let i = 1; i < projected.length; i++) {
        const board = boards[cell.boards[i]],
          q = board.corners
        const pitch =
          (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y)) / 18
        if (Math.hypot(projected[i].x - projected[0].x, projected[i].y - projected[0].y) > pitch * 0.6)
          return `Совместите общий блок полей ${cell.boards[0] + 1} и ${cell.boards[i] + 1} на фотографии.`
      }
    }
  return ''
}
export function photoGroups(boards: PhotoBoard[]): PhotoBoard[][] {
  const remaining = new Set(boards),
    groups: PhotoBoard[][] = []
  while (remaining.size) {
    const group = [remaining.values().next().value!]
    remaining.delete(group[0])
    for (let i = 0; i < group.length; i++)
      for (const b of remaining) {
        if (Math.abs(b.x - group[i].x) < 9 && Math.abs(b.y - group[i].y) < 9) {
          group.push(b)
          remaining.delete(b)
        }
      }
    group.sort((a, b) => a.y - b.y || a.x - b.x)
    const x = Math.min(...group.map((b) => b.x)),
      y = Math.min(...group.map((b) => b.y))
    groups.push(group.map((b) => ({ ...b, x: b.x - x, y: b.y - y })))
  }
  return groups
}
