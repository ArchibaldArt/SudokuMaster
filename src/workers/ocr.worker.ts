import { createWorker, PSM } from 'tesseract.js'
import type { Worker as TesseractWorker } from 'tesseract.js'

let ocr: TesseractWorker | null = null
let currentId = 0
let failed = false

// Own the Tesseract child worker inside this disposable worker. This also makes
// cancellation reliable while Tesseract is still loading its language model.
self.onmessage = async ({
  data,
}: MessageEvent<{
  id: number
  type: 'init' | 'recognize'
  image?: string
  paths?: { workerPath: string; corePath: string; langPath: string }
}>) => {
  currentId = data.id
  try {
    if (data.type === 'init') {
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
      if (!/^\d{1,2}$/.test(result.text.trim()) || result.confidence < 65) {
        await ocr.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD })
        const retry = await ocr.recognize(data.image!)
        await ocr.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
        if (retry.data.confidence > result.confidence || !result.text.trim()) result = retry.data
      }
      self.postMessage({ id: data.id, result: { text: result.text, confidence: result.confidence } })
    }
  } catch {
    self.postMessage({ id: data.id, error: true })
  }
}
