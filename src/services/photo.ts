import type { BoardSize, CellRecognition, Corners, RecognitionMode, RecognitionResult } from '../core/types'
import { photoLayoutError } from '../core/photo-layout'
import { emptyLayout, topology } from '../core/topology'
import { emptyPuzzle } from '../core/types'
import { validCorners } from '../core/geometry'

export interface PhotoSource {
  image: ImageData
  url: string
  name: string
}
export interface PhotoBoard {
  x: number
  y: number
  corners: Corners
  confidence: number
}
export interface Detection {
  boards?: PhotoBoard[]
  corners: Corners
  detected: boolean
  suggestedSize: BoardSize | null
}
interface PreparedCell {
  index: number
  rect: CellRecognition['rect']
  empty: boolean
  ambiguous: boolean
  digitHint?: 8
  width?: number
  height?: number
  data?: Uint8Array
}
interface Prepared {
  width: number
  height: number
  data: Uint8ClampedArray
  cells: PreparedCell[]
}
export interface PhotoProgress {
  fraction: number
  label: string
}
const localAsset = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href

export function imageUrl(image: ImageData): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.91)
}

export async function readPhoto(file: File): Promise<PhotoSource> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error(
      'Выберите фотографию в формате JPEG, PNG или WebP. HEIC можно предварительно сохранить как JPEG.',
    )
  if (file.size > 25 * 1024 * 1024)
    throw new Error('Файл больше 25 МБ. Выберите уменьшенную копию фотографии.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Не удалось прочитать изображение. Проверьте файл или выберите другую фотографию.')
  }
  try {
    if (bitmap.width * bitmap.height > 50_000_000)
      throw new Error('Слишком большое изображение. Уменьшите его до 50 мегапикселей.')
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return {
      image: context.getImageData(0, 0, canvas.width, canvas.height),
      url: canvas.toDataURL('image/jpeg', 0.91),
      name: file.name,
    }
  } finally {
    bitmap.close()
  }
}

export function rotatePhoto(source: PhotoSource): PhotoSource {
  const original = document.createElement('canvas')
  original.width = source.image.width
  original.height = source.image.height
  original.getContext('2d')!.putImageData(source.image, 0, 0)
  const rotated = document.createElement('canvas')
  rotated.width = original.height
  rotated.height = original.width
  const context = rotated.getContext('2d')!
  context.translate(rotated.width, 0)
  context.rotate(Math.PI / 2)
  context.drawImage(original, 0, 0)
  return {
    image: context.getImageData(0, 0, rotated.width, rotated.height),
    url: rotated.toDataURL('image/jpeg', 0.91),
    name: source.name,
  }
}

export class PhotoProcessor {
  private vision: Worker | null = null
  private ocr: Worker | null = null
  private aborted = false
  private sequence = 0
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  cancel() {
    this.aborted = true
    this.vision?.terminate()
    this.vision = null
    this.ocr?.terminate()
    this.ocr = null
    for (const p of this.pending.values()) p.reject(new DOMException('Отменено', 'AbortError'))
    this.pending.clear()
  }
  private check() {
    if (this.aborted) throw new DOMException('Отменено', 'AbortError')
  }
  private request<T>(type: string, source: PhotoSource, args: object = {}): Promise<T> {
    this.check()
    if (!this.vision) {
      this.vision = new Worker(localAsset('vision.worker.js'))
      this.vision.onmessage = ({ data }) => {
        const promise = this.pending.get(data.id)
        if (data.error)
          promise?.reject(
            new Error('Не удалось обработать фото. Попробуйте другой снимок или введите числа вручную.'),
          )
        else promise?.resolve(data.result)
        this.pending.delete(data.id)
      }
      this.vision.onerror = () => {
        for (const p of this.pending.values())
          p.reject(
            new Error(
              'Не удалось загрузить обработку фотографий. Можно попробовать снова или ввести числа вручную.',
            ),
          )
        this.pending.clear()
        this.vision?.terminate()
        this.vision = null
      }
    }
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
      const data = new Uint8ClampedArray(source.image.data)
      this.vision!.postMessage(
        { id, type, image: { width: source.image.width, height: source.image.height, data }, ...args },
        [data.buffer],
      )
    })
  }
  detect(source: PhotoSource) {
    return this.request<Detection>('detect', source)
  }
  private requestOCR<T>(type: string, payload: object = {}): Promise<T> {
    this.check()
    if (!this.ocr) {
      const worker = new Worker(new URL('../workers/ocr.worker.ts', import.meta.url), { type: 'module' })
      this.ocr = worker
      worker.onmessage = ({ data }) => {
        if (this.ocr !== worker) return
        const promise = this.pending.get(data.id)
        if (data.error)
          promise?.reject(
            new Error(
              'Не удалось загрузить или выполнить распознавание. Проверьте подключение и попробуйте снова.',
            ),
          )
        else promise?.resolve(data.result)
        this.pending.delete(data.id)
      }
      worker.onerror = () => {
        if (this.ocr !== worker) return
        for (const p of this.pending.values())
          p.reject(new Error('Распознавание недоступно. Попробуйте ещё раз или введите числа вручную.'))
        this.pending.clear()
        worker.terminate()
        this.ocr = null
      }
    }
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
      this.ocr!.postMessage({ id, type, ...payload })
    })
  }
  async recognize(
    source: PhotoSource,
    corners: Corners,
    size: BoardSize,
    progress: (p: PhotoProgress) => void,
    boards?: PhotoBoard[],
    mode: RecognitionMode = 'all',
  ): Promise<RecognitionResult> {
    if (boards) {
      const error = photoLayoutError(boards, source.image.width, source.image.height)
      if (error) throw new Error(error)
    }
    const puzzle = boards ? emptyLayout(boards) : emptyPuzzle(size)
    const geometry = topology(puzzle)
    const plans = boards ?? [{ corners }]
    for (const plan of plans)
      if (!validCorners(plan.corners, source.image.width, source.image.height, boards ? 0.0001 : 0.04))
        throw new Error('Углы поля должны образовывать четырёхугольник без пересечений. Поправьте выделение.')
    progress({ fraction: 0.01, label: 'Загружаем распознавание. В первый раз это займёт чуть дольше…' })
    try {
      await this.requestOCR('init', {
        size: puzzle.size,
        paths: {
          workerPath: localAsset('vendor/tesseract/worker.min.js'),
          corePath: localAsset('vendor/tesseract/core'),
          langPath: localAsset('vendor/tesseract/lang'),
        },
      })
      const cells = new Array<CellRecognition>(geometry.cells.length)
      let url = source.url,
        width = source.image.width,
        height = source.image.height
      for (let b = 0; b < plans.length; b++) {
        this.check()
        const prefix = boards ? `Поле ${b + 1} из ${plans.length}. ` : ''
        progress({
          fraction: 0.08 + (0.92 * b) / plans.length,
          label: `${prefix}${mode === 'printed' ? 'Выравниваем поле и убираем пометки…' : 'Выравниваем поле и подготавливаем числа…'}`,
        })
        const prepared = await this.request<Prepared>('prepare', source, {
          corners: plans[b].corners,
          size: puzzle.size,
          mode,
        })
        this.check()
        const original = document.createElement('canvas')
        original.width = prepared.width
        original.height = prepared.height
        original
          .getContext('2d')!
          .putImageData(
            new ImageData(new Uint8ClampedArray(prepared.data), prepared.width, prepared.height),
            0,
            0,
          )
        if (!boards) {
          url = original.toDataURL('image/jpeg', 0.91)
          width = prepared.width
          height = prepared.height
        }
        const owned = prepared.cells.filter(
          (c) => geometry.cells[geometry.boards[b].cells[c.index]].boards[0] === b,
        )
        const occupied = owned.filter((c) => !c.empty).length
        let done = 0
        for (const cell of owned) {
          this.check()
          const index = geometry.boards[b].cells[cell.index]
          let previewUrl: string | undefined
          if (boards) {
            const preview = document.createElement('canvas')
            preview.width = 112
            preview.height = 112
            preview
              .getContext('2d')!
              .drawImage(original, cell.rect.x, cell.rect.y, cell.rect.w, cell.rect.h, 0, 0, 112, 112)
            previewUrl = preview.toDataURL('image/jpeg', 0.9)
          }
          if (cell.empty) {
            cells[index] = {
              index,
              rect: cell.rect,
              previewUrl,
              value: 0,
              confidence: 0,
              needsReview: cell.ambiguous,
              raw: '',
            }
            continue
          }
          const canvas = document.createElement('canvas')
          canvas.width = cell.width!
          canvas.height = cell.height!
          const rgba = new Uint8ClampedArray(cell.data!.length * 4)
          for (let i = 0; i < cell.data!.length; i++) {
            rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = cell.data![i]
            rgba[i * 4 + 3] = 255
          }
          canvas.getContext('2d')!.putImageData(new ImageData(rgba, canvas.width, canvas.height), 0, 0)
          const data = await this.requestOCR<{ text: string; confidence: number }>('recognize', {
            image: canvas.toDataURL('image/png'),
          })
          this.check()
          const raw = data.text.trim(),
            parsed = /^\d{1,2}$/.test(raw) ? Number(raw) : 0
          const recognizedValue = parsed >= 1 && parsed <= puzzle.size ? parsed : 0
          const value =
            cell.digitHint && (!recognizedValue || recognizedValue === 3) ? cell.digitHint : recognizedValue
          cells[index] = {
            index,
            rect: cell.rect,
            previewUrl,
            value,
            confidence: data.confidence,
            raw,
            needsReview: !value || data.confidence < 75 || cell.ambiguous || value !== recognizedValue,
          }
          done++
          progress({
            fraction: 0.08 + (0.92 * (b + done / Math.max(1, occupied))) / plans.length,
            label: `${prefix}Распознано чисел: ${done} из ${occupied}`,
          })
        }
      }
      puzzle.givens = cells.map((c) => c.value)
      return { puzzle, cells, imageUrl: url, imageSize: { width, height } }
    } finally {
      this.ocr?.terminate()
      this.ocr = null
    }
  }
}
