import type { Corners } from './types'

export function validCorners(points: Corners, width: number, height: number): boolean {
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height,
    )
  )
    return false
  let area = 0
  for (let i = 0; i < 4; i++) {
    const a = points[i],
      b = points[(i + 1) % 4],
      c = points[(i + 2) % 4]
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) return false
    area += a.x * b.y - b.x * a.y
  }
  return area / 2 > width * height * 0.04
}
