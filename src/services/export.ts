import { puzzleTitle, topology } from '../core/topology'
import type { PuzzleDefinition } from '../core/types'

export async function solutionImage(
  puzzle: PuzzleDefinition,
  values: number[],
  status: string,
): Promise<Blob> {
  const geometry = topology(puzzle)
  const cell = puzzle.boards
    ? Math.min(64, 8000 / Math.max(geometry.width, geometry.height))
    : (puzzle.size === 9 ? 1080 : 1536) / puzzle.size
  const width = geometry.width * cell,
    height = geometry.height * cell
  const margin = 64,
    top = 128,
    footer = 100
  const canvas = document.createElement('canvas')
  canvas.width = width + margin * 2
  canvas.height = height + top + footer
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#2457d6'
  ctx.font = 'bold 38px Arial'
  ctx.fillText('SudokuMaster', margin, 62)
  ctx.fillStyle = '#526077'
  ctx.font = '22px Arial'
  ctx.fillText(`${puzzleTitle(puzzle)} · ${status}`, margin, 99)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  values.forEach((value, i) => {
    if (!value) return
    ctx.fillStyle = puzzle.givens[i] ? '#172033' : '#2457d6'
    ctx.font = `${puzzle.givens[i] ? 'bold ' : ''}${Math.round(cell * 0.44)}px Arial`
    ctx.fillText(
      String(value),
      margin + (geometry.cells[i].x + 0.5) * cell,
      top + (geometry.cells[i].y + 0.5) * cell,
    )
  })
  const edges = new Map<string, { x: number; y: number; dx: number; dy: number; bold: boolean }>()
  for (const { x, y } of geometry.cells) {
    for (const [ex, ey, dx, dy] of [
      [x, y, 1, 0],
      [x, y + 1, 1, 0],
      [x, y, 0, 1],
      [x + 1, y, 0, 1],
    ]) {
      edges.set(`${ex},${ey},${dx}`, { x: ex, y: ey, dx, dy, bold: (dx ? ey : ex) % puzzle.boxSize === 0 })
    }
  }
  for (const edge of edges.values()) {
    ctx.lineWidth = edge.bold ? 3 : 1
    ctx.strokeStyle = edge.bold ? '#43536e' : '#d7deea'
    ctx.beginPath()
    ctx.moveTo(margin + edge.x * cell, top + edge.y * cell)
    ctx.lineTo(margin + (edge.x + edge.dx) * cell, top + (edge.y + edge.dy) * cell)
    ctx.stroke()
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#526077'
  ctx.font = '21px Arial'
  ctx.fillText('Тёмные числа — исходная задача. Синие — найденное решение.', margin, top + height + 48)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось создать изображение'))),
      'image/png',
    ),
  )
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
