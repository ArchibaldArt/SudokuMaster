import { expect, it } from 'vitest'
import { photoGroups, photoLayoutError, photoTemplate, projectQuad } from './photo-layout'
import { layouts } from './topology'
import type { Corners } from './types'

const frame: Corners = [
  { x: 20, y: 30 },
  { x: 650, y: 10 },
  { x: 680, y: 1000 },
  { x: 10, y: 960 },
]
it('projects every shared block consistently through a perspective transform', () => {
  expect(projectQuad(frame, 0, 0)).toEqual(frame[0])
  expect(projectQuad(frame, 1, 1).x).toBeCloseTo(frame[2].x)
  const boards = photoTemplate(layouts.eight.boards, frame)
  expect(photoLayoutError(boards, 700, 1100)).toBe('')
  boards[2].corners = boards[2].corners.map((p) => ({ x: p.x + 30, y: p.y })) as Corners
  expect(photoLayoutError(boards, 700, 1100)).toContain('Совместите общий блок')
})
it('rejects crossed photo corners and separates unrelated puzzles in reading order', () => {
  const boards = photoTemplate(layouts.eight.boards, frame)
  const groups = photoGroups([...boards].reverse())
  expect(groups).toHaveLength(1)
  expect(groups[0].map(({ x, y }) => [x, y])).toEqual(layouts.eight.boards.map(({ x, y }) => [x, y]))
  expect(photoGroups([boards[0], { ...boards[0], x: 30 }])).toHaveLength(2)
  boards[0].corners = [frame[0], frame[2], frame[1], frame[3]]
  expect(photoLayoutError(boards, 700, 1100)).toContain('Поправьте углы поля 1')
})
