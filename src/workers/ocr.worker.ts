import { createWorker, PSM } from 'tesseract.js'
import type { Worker as TesseractWorker } from 'tesseract.js'

let ocr: TesseractWorker | null = null
let currentId = 0
let failed = false
let size = 16

// Own the Tesseract child worker inside this disposable worker. This also makes
// cancellation reliable while Tesseract is still loading its language model.
self.onmessage = async ({
  data,
}: MessageEvent<{
  id: number
  type: 'init' | 'recognize'
  image?: string
  size?: number
  paths?: { workerPath: string; corePath: string; langPath: string }
}>) => {
  currentId = data.id
  try {
    if (data.type === 'init') {
      size = data.size ?? 16
      ocr = await createWorker('eng', 1, {
        ...data.paths,
        workerBlobURL: false,
        gzip: true,
        // Some Tesseract initialization failures only reach errorHandler, without
        // rejecting createWorker. Forward them immediately so the UI cannot hang.
        errorHandler: () => {
          failed = true
          self.postMessage({ id: currentId, error: true })
        },
      })
      if (failed) return
      await ocr.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        user_defined_dpi: '300',
      })
      self.postMessage({ id: data.id, result: true })
    } else {
      if (!ocr || failed) throw new Error('OCR is unavailable')
      let { data: result } = await ocr.recognize(data.image!)
      const valid = (text: string) =>
        /^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= size
      if (!valid(result.text) || result.confidence < 65) {
        await ocr.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD })
        const retry = await ocr.recognize(data.image!)
        await ocr.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
        if (valid(retry.data.text) && (!valid(result.text) || retry.data.confidence > result.confidence))
          result = retry.data
      }
      if (size === 9 && (!valid(result.text) || result.confidence < 75)) {
        await ocr.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_CHAR })
        const retry = await ocr.recognize(data.image!)
        await ocr.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
        if (valid(retry.data.text) && (!valid(result.text) || retry.data.confidence > result.confidence))
          result = retry.data
      }
      self.postMessage({ id: data.id, result: { text: result.text, confidence: result.confidence } })
    }
  } catch {
    self.postMessage({ id: data.id, error: true })
  }
}
