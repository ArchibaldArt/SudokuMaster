import { expect, it } from 'vitest'
import { validCorners } from './geometry'

it('accepts a perspective quadrilateral and rejects crossed, tiny and out-of-bounds selections', () => {
  expect(
    validCorners(
      [
        { x: 10, y: 20 },
        { x: 90, y: 5 },
        { x: 95, y: 90 },
        { x: 5, y: 95 },
      ],
      100,
      100,
    ),
  ).toBe(true)
  expect(
    validCorners(
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ],
      100,
      100,
    ),
  ).toBe(false)
  expect(
    validCorners(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      100,
      100,
    ),
  ).toBe(false)
  expect(
    validCorners(
      [
        { x: -1, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      100,
      100,
    ),
  ).toBe(false)
})
