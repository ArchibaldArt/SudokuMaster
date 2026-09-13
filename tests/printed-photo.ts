import type { Page } from '@playwright/test'
import type { BoardSize } from '../src/core/types'
import { getExample } from '../src/data/examples'

export async function printedPhoto(page: Page, size: BoardSize, rotate = false) {
  const base64 = await page.evaluate(
    ({ values, size, rotate }) => {
      const side = size * 100 + 200
      const canvas = document.createElement('canvas')
      canvas.width = side
      canvas.height = side
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, side, side)
      if (rotate) {
        ctx.translate(side, 0)
        ctx.rotate(Math.PI / 2)
      }
      for (let i = 0; i <= size; i++) {
        ctx.strokeStyle = '#111'
        ctx.lineWidth = i % Math.sqrt(size) === 0 ? 5 : 2
        ctx.beginPath()
        ctx.moveTo(100 + i * 100, 100)
        ctx.lineTo(100 + i * 100, side - 100)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(100, 100 + i * 100)
        ctx.lineTo(side - 100, 100 + i * 100)
        ctx.stroke()
      }
      ctx.fillStyle = '#111'
      ctx.font = size === 9 ? 'bold 50px Arial' : '50px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      values.forEach((v, i) => {
        if (v) ctx.fillText(String(v), 150 + (i % size) * 100, 150 + Math.floor(i / size) * 100)
      })
      return canvas.toDataURL('image/png').split(',')[1]
    },
    { values: getExample(size).givens, size, rotate },
  )
  return { name: `clean${size}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }
}
