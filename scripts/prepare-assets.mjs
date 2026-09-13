import { copyFile, mkdir, readdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
async function copy(source, target) {
  const destination = path.join(root, 'public/vendor', target)
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(path.join(root, 'node_modules', source), destination)
}
await copy('@techstark/opencv-js/dist/opencv.js', 'opencv/opencv.js')
await copy('tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js')
const coreFiles = await readdir(path.join(root, 'node_modules/tesseract.js-core'))
for (const file of coreFiles.filter((file) => /-lstm\.wasm\.js$/.test(file))) {
  await copy(`tesseract.js-core/${file}`, `tesseract/core/${file}`)
}
await copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz')
for (const name of [
  'tesseract.js',
  'tesseract.js-core',
  '@techstark/opencv-js',
  'react',
  'react-dom',
  'lucide-react',
]) {
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try {
      await access(path.join(root, 'node_modules', name, file))
      await copy(`${name}/${file}`, `licenses/${name.replaceAll('/', '-')}.txt`)
      break
    } catch {
      /* License filenames differ across packages. */
    }
  }
}
console.log(
  'OpenCV, OCR worker, WASM and language model copied to public/vendor. No runtime CDN requests required.',
)
