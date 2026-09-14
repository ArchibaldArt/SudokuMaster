import type { Page } from '@playwright/test'
import type { BoardSize } from '../src/core/types'
import { getExample } from '../src/data/examples'

/** Known image-only deformation, independent of the geometry estimator. */
export async function curvedPhoto(page: Page, size: BoardSize, bend = 0.38, missing = false) {
  return page.evaluate(
    ({ size, values, bend, missing }) => {
      const pitch = 80,
        side = size * pitch,
        margin = 90,
        extent = side + margin * 2
      const flat = document.createElement('canvas')
      flat.width = flat.height = extent
      const ctx = flat.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, extent, extent)
      ctx.strokeStyle = '#111'
      for (let i = 0; i <= size; i++) {
        ctx.lineWidth = i % Math.sqrt(size) ? 2 : 5
        ctx.beginPath()
        ctx.moveTo(margin + i * pitch, margin)
        // A missing thin separator inside the top-left block tests local fallback.
        if (missing && i === 1) ctx.moveTo(margin + i * pitch, margin + Math.sqrt(size) * pitch)
        ctx.lineTo(margin + i * pitch, margin + side)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(margin, margin + i * pitch)
        ctx.lineTo(margin + side, margin + i * pitch)
        ctx.stroke()
      }
      ctx.fillStyle = '#111'
      ctx.font = '48px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      values.forEach((value, i) => {
        if (value)
          ctx.fillText(
            String(value),
            margin + ((i % size) + 0.5) * pitch,
            margin + (Math.floor(i / size) + 0.5) * pitch,
          )
      })
      const data = ctx.getImageData(0, 0, extent, extent).data
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = extent
      const context = canvas.getContext('2d')!
      const output = context.createImageData(extent, extent)
      output.data.fill(255)
      const amplitude = bend / size
      for (let y = 0; y < extent; y++)
        for (let x = 0; x < extent; x++) {
          const X = (x - margin) / side,
            Y = (y - margin) / side
          // Inverse of a projective tilt, followed by a smooth page curl in both axes.
          const t = (Y - 0.04 * X) / 0.92
          const b = t / (1 - 0.12 * t),
            a = X * (1 + 0.12 * b)
          let u = a,
            v = b
          for (let k = 0; k < 8; k++) {
            u = a - amplitude * Math.sin(2 * Math.PI * v)
            v = b - amplitude * 0.75 * Math.sin(Math.PI * u)
          }
          const sx = margin + u * side,
            sy = margin + v * side
          const ix = Math.floor(sx),
            iy = Math.floor(sy)
          if (ix < 0 || iy < 0 || ix + 1 >= extent || iy + 1 >= extent) continue
          const fx = sx - ix,
            fy = sy - iy
          for (let c = 0; c < 3; c++)
            output.data[(y * extent + x) * 4 + c] =
              (1 - fy) *
                ((1 - fx) * data[(iy * extent + ix) * 4 + c] + fx * data[(iy * extent + ix + 1) * 4 + c]) +
              fy *
                ((1 - fx) * data[((iy + 1) * extent + ix) * 4 + c] +
                  fx * data[((iy + 1) * extent + ix + 1) * 4 + c])
        }
      context.putImageData(output, 0, 0)
      const project = (u: number, v: number) => ({
        x: margin + (side * u) / (1 + 0.12 * v),
        y: margin + (side * (v * 0.92 + u * 0.04)) / (1 + 0.12 * v),
      })
      return {
        url: canvas.toDataURL('image/png'),
        corners: [project(0, 0), project(1, 0), project(1, 1), project(0, 1)],
        values,
      }
    },
    { size, values: getExample(size).givens, bend, missing },
  )
}
