import type { PuzzleDefinition } from '../core/types'

export async function solutionImage(
  puzzle: PuzzleDefinition,
  values: number[],
  status: string,
): Promise<Blob> {
  const side = puzzle.size === 9 ? 1080 : 1536
  const margin = 64,
    top = 128,
    footer = 100
  const canvas = document.createElement('canvas')
  canvas.width = side + margin * 2
  canvas.height = side + top + footer
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#2457d6'
  ctx.font = 'bold 38px Arial'
  ctx.fillText('SudokuMaster', margin, 62)
  ctx.fillStyle = '#526077'
  ctx.font = '22px Arial'
  ctx.fillText(`${puzzle.size} × ${puzzle.size} · ${status}`, margin, 99)
  const cell = side / puzzle.size
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  values.forEach((value, i) => {
    ctx.fillStyle = puzzle.givens[i] ? '#172033' : '#2457d6'
    ctx.font = `${puzzle.givens[i] ? 'bold ' : ''}${Math.round(cell * 0.44)}px Arial`
    ctx.fillText(
      String(value),
      margin + ((i % puzzle.size) + 0.5) * cell,
      top + (Math.floor(i / puzzle.size) + 0.5) * cell,
    )
  })
  for (let i = 0; i <= puzzle.size; i++) {
    ctx.lineWidth = i % puzzle.boxSize === 0 ? 4 : 1
    ctx.strokeStyle = i % puzzle.boxSize === 0 ? '#43536e' : '#d7deea'
    ctx.beginPath()
    ctx.moveTo(margin + i * cell, top)
    ctx.lineTo(margin + i * cell, top + side)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(margin, top + i * cell)
    ctx.lineTo(margin + side, top + i * cell)
    ctx.stroke()
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#526077'
  ctx.font = '21px Arial'
  ctx.fillText('Тёмные числа — исходная задача. Синие — найденное решение.', margin, top + side + 48)
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
