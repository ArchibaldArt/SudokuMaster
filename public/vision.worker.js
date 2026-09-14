/* OpenCV runs in a classic worker so its WASM loader never blocks the page. */
importScripts(new URL('./composition-vision.js', self.location.href).href)
let ready
function getCV() {
  if (!ready)
    ready = (async () => {
      importScripts(new URL('./vendor/opencv/opencv.js', self.location.href).href)
      return await self.cv
    })()
  return ready
}

function ordered(points) {
  const sum = (p) => p.x + p.y,
    diff = (p) => p.y - p.x
  return [
    points.reduce((a, b) => (sum(a) < sum(b) ? a : b)),
    points.reduce((a, b) => (diff(a) < diff(b) ? a : b)),
    points.reduce((a, b) => (sum(a) > sum(b) ? a : b)),
    points.reduce((a, b) => (diff(a) > diff(b) ? a : b)),
  ]
}

function threshold(cv, src, offset = 12, block = 31) {
  const gray = new cv.Mat(),
    binary = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.adaptiveThreshold(
      gray,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      block,
      offset,
    )
    return binary
  } finally {
    gray.delete()
  }
}

function warp(cv, src, corners, side, height = side) {
  const from = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    corners.flatMap((p) => [p.x, p.y]),
  )
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, side - 1, 0, side - 1, height - 1, 0, height - 1])
  const matrix = cv.getPerspectiveTransform(from, to)
  const dst = new cv.Mat()
  try {
    cv.warpPerspective(
      src,
      dst,
      matrix,
      new cv.Size(side, height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    )
    return dst
  } finally {
    from.delete()
    to.delete()
    matrix.delete()
  }
}

function lines(cv, binary, vertical) {
  const extracted = new cv.Mat()
  const kernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(
      vertical ? 1 : Math.max(15, Math.round(binary.cols / 25)),
      vertical ? Math.max(15, Math.round(binary.rows / 25)) : 1,
    ),
  )
  const tolerance = Math.max(3, Math.round(binary.cols / 110))
  const spread = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(vertical ? tolerance : 1, vertical ? 1 : tolerance),
  )
  try {
    cv.morphologyEx(binary, extracted, cv.MORPH_OPEN, kernel)
    // A photographed page can bow slightly: group near-parallel line segments
    // into the same projection peak instead of requiring a perfectly straight line.
    cv.dilate(extracted, extracted, spread)
    const length = vertical ? binary.cols : binary.rows
    const across = vertical ? binary.rows : binary.cols
    const scores = new Float64Array(length)
    for (let p = 0; p < length; p++)
      for (let q = 0; q < across; q++) {
        scores[p] += extracted.data[vertical ? q * binary.cols + p : p * binary.cols + q] > 0 ? 1 : 0
      }
    const peaks = []
    for (let i = 0; i < length; i++)
      if (scores[i] > across * 0.23) {
        let total = 0,
          weight = 0
        while (i < length && scores[i] > across * 0.16) {
          total += i * scores[i]
          weight += scores[i]
          i++
        }
        peaks.push(total / weight)
      }
    return peaks
  } finally {
    extracted.delete()
    kernel.delete()
    spread.delete()
  }
}

function detect(cv, src) {
  const boards = detectComposition(cv, src)
  if (boards) return { corners: boards[0].corners, detected: true, suggestedSize: 9, boards }

  const binary = threshold(cv, src),
    contours = new cv.MatVector(),
    hierarchy = new cv.Mat()
  let corners = [
    { x: src.cols * 0.03, y: src.rows * 0.03 },
    { x: src.cols * 0.97, y: src.rows * 0.03 },
    { x: src.cols * 0.97, y: src.rows * 0.97 },
    { x: src.cols * 0.03, y: src.rows * 0.97 },
  ]
  let area = 0
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i),
        approx = new cv.Mat()
      try {
        const current = cv.contourArea(contour)
        if (current < src.rows * src.cols * 0.12 || current <= area) continue
        cv.approxPolyDP(contour, approx, cv.arcLength(contour, true) * 0.025, true)
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          corners = ordered(
            Array.from({ length: 4 }, (_, j) => ({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })),
          )
          area = current
        }
      } finally {
        contour.delete()
        approx.delete()
      }
    }
    const rectified = warp(cv, src, corners, 768)
    const grid = threshold(cv, rectified)
    try {
      const count = Math.max(lines(cv, grid, true).length, lines(cv, grid, false).length)
      return { corners, detected: area > 0, suggestedSize: count >= 14 ? 16 : count >= 8 ? 9 : null }
    } finally {
      rectified.delete()
      grid.delete()
    }
  } finally {
    binary.delete()
    contours.delete()
    hierarchy.delete()
  }
}

function boundaries(peaks, size, side) {
  const ordered = [...peaks].sort((a, b) => a - b)
  if (!ordered.length || ordered[0] > (side / size) * 0.4) ordered.unshift(0)
  if (ordered[ordered.length - 1] < side - 1 - (side / size) * 0.4) ordered.push(side - 1)
  // Magazine cells need not have identical photographed widths. Use the actual
  // ordered grid lines whenever all separators have been found.
  if (ordered.length === size + 1) return ordered.map(Math.round)
  return Array.from({ length: size + 1 }, (_, i) => {
    const expected = (i * (side - 1)) / size
    const nearest = peaks.reduce(
      (best, p) => (Math.abs(p - expected) < Math.abs(best - expected) ? p : best),
      -side,
    )
    return Math.round(Math.abs(nearest - expected) < (side / size) * 0.22 ? nearest : expected)
  })
}

function prepare(cv, src, corners, size) {
  const side = size === 16 ? 1536 : 1080
  const sourcePitch =
    (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) +
      Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y)) /
    (2 * size)
  const smallPrint = sourcePitch < 45
  const rectified = warp(cv, src, corners, side)
  const cleaned = new cv.Mat()
  rectified.copyTo(cleaned)
  let binary
  try {
    // Compare ink with the local paper colour. Raw blue-minus-red is unreliable
    // under yellow room lighting and can erase the dark parts of printed digits.
    const cellSide = side / size
    const inkHistogram = new Uint32Array(256)
    let inkSamples = 0
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
        const x0 = Math.floor(col * cellSide),
          x1 = Math.floor((col + 1) * cellSide)
        const y0 = Math.floor(row * cellSide),
          y1 = Math.floor((row + 1) * cellSide)
        let samples = 0
        for (let y = y0; y < y1; y += 2)
          for (let x = x0; x < x1; x += 2) {
            const p = (y * side + x) * 4
            for (let c = 0; c < 3; c++) hist[c][cleaned.data[p + c]]++
            samples++
          }
        const paper = hist.map((channel) => {
          let total = 0
          for (let v = 0; v < 256; v++) {
            total += channel[v]
            if (total >= samples * 0.85) return Math.max(40, v)
          }
          return 255
        })
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const p = (y * side + x) * 4
            const r = cleaned.data[p] / paper[0],
              g = cleaned.data[p + 1] / paper[1],
              b = cleaned.data[p + 2] / paper[2]
            const blue = b - r > 0.055 && Math.max(r, g, b) > 0.25
            const gray = blue ? 255 : Math.min(255, Math.round(((r + g + b) / 3) * 255))
            if (gray < 190) {
              inkHistogram[gray]++
              inkSamples++
            }
            cleaned.data[p] = gray
            cleaned.data[p + 1] = gray
            cleaned.data[p + 2] = gray
          }
      }
    let inkReference = 0,
      cumulative = 0
    for (let i = 0; i < 190; i++) {
      cumulative += inkHistogram[i]
      if (cumulative >= inkSamples * 0.25) {
        inkReference = i / 255
        break
      }
    }
    const inkToneLimit = Math.min(0.72, inkReference + 0.19)
    if (smallPrint) cv.GaussianBlur(cleaned, cleaned, new cv.Size(3, 3), 0)
    binary = threshold(cv, cleaned, smallPrint ? 5 : 12, smallPrint ? 51 : 31)
    const inkKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3))
    try {
      cv.morphologyEx(binary, binary, cv.MORPH_OPEN, inkKernel)
    } finally {
      inkKernel.delete()
    }
    const gridMask = threshold(cv, rectified)
    let xs, ys
    try {
      xs = boundaries(lines(cv, gridMask, true), size, side)
      ys = boundaries(lines(cv, gridMask, false), size, side)
    } finally {
      gridMask.delete()
    }
    const cells = []
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const index = row * size + col
        const inset = Math.max(4, Math.round((side / size) * 0.055))
        const x = xs[col] + inset,
          y = ys[row] + inset
        const w = Math.max(2, xs[col + 1] - xs[col] - inset * 2),
          h = Math.max(2, ys[row + 1] - ys[row] - inset * 2)
        const roi = binary.roi(new cv.Rect(x, y, w, h))
        const labels = new cv.Mat(),
          stats = new cv.Mat(),
          centers = new cv.Mat(),
          distance = new cv.Mat()
        const glyph = cv.Mat.zeros(h, w, cv.CV_8UC1)
        let resized, padded
        try {
          const count = cv.connectedComponentsWithStats(roi, labels, stats, centers, 8, cv.CV_32S)
          cv.distanceTransform(roi, distance, cv.DIST_L2, 3)
          const thickness = new Float32Array(count)
          const tones = new Float64Array(count)
          for (let p = 0; p < labels.data32S.length; p++) {
            const label = labels.data32S[p]
            thickness[label] = Math.max(thickness[label], distance.data32F[p])
            if (label) tones[label] += cleaned.data[((y + Math.floor(p / w)) * side + x + (p % w)) * 4] / 255
          }
          const keep = new Set()
          let ink = 0,
            allInk = 0,
            minX = w,
            minY = h,
            maxX = 0,
            maxY = 0
          for (let n = 1; n < count; n++) {
            const left = stats.intAt(n, cv.CC_STAT_LEFT),
              top = stats.intAt(n, cv.CC_STAT_TOP)
            const cw = stats.intAt(n, cv.CC_STAT_WIDTH),
              ch = stats.intAt(n, cv.CC_STAT_HEIGHT)
            const area = stats.intAt(n, cv.CC_STAT_AREA)
            allInk += area
            if (ch < h * 0.3 || area < w * h * 0.015 || cw > w * 0.95 || ch > h * 0.97) continue
            // Printed magazine digits are heavier than thin pencil/pen candidates.
            // Ambiguous components are left for review instead of being trusted.
            if (thickness[n] < Math.max(1.8, ch * 0.045)) continue
            if (tones[n] / area > inkToneLimit) continue
            if (left + cw / 2 < w * 0.04 || left + cw / 2 > w * 0.96) continue
            keep.add(n)
            ink += area
            minX = Math.min(minX, left)
            minY = Math.min(minY, top)
            maxX = Math.max(maxX, left + cw)
            maxY = Math.max(maxY, top + ch)
          }
          if (!keep.size) {
            cells.push({ index, rect: { x, y, w, h }, empty: true, ambiguous: allInk > w * h * 0.035 })
            continue
          }
          for (let p = 0; p < labels.data32S.length; p++) if (keep.has(labels.data32S[p])) glyph.data[p] = 255
          // Two substantial enclosed counters in one connected glyph identify an 8.
          // This image-only cross-check catches confident OCR confusions with 3;
          // disagreements still require review and never consult sudoku constraints.
          let digitHint
          if (size === 9 && keep.size === 1) {
            const outlines = new cv.MatVector(),
              nesting = new cv.Mat()
            const holes = []
            try {
              cv.findContours(glyph, outlines, nesting, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE)
              for (let j = 0; j < outlines.size(); j++) {
                const outline = outlines.get(j)
                try {
                  if (
                    nesting.data32S[j * 4 + 3] < 0 ||
                    cv.contourArea(outline) < (maxX - minX) * (maxY - minY) * 0.025
                  )
                    continue
                  const bounds = cv.boundingRect(outline)
                  holes.push({
                    x: bounds.x + bounds.width / 2,
                    y: bounds.y + bounds.height / 2,
                    height: bounds.height,
                  })
                } finally {
                  outline.delete()
                }
              }
              if (
                holes.length === 2 &&
                holes.every((hole) => hole.height > (maxY - minY) * 0.12) &&
                Math.abs(holes[0].x - holes[1].x) < (maxX - minX) * 0.25 &&
                Math.abs(holes[0].y - holes[1].y) > (maxY - minY) * 0.2
              )
                digitHint = 8
            } finally {
              outlines.delete()
              nesting.delete()
            }
          }
          const cropped = glyph.roi(new cv.Rect(minX, minY, maxX - minX, maxY - minY))
          resized = new cv.Mat()
          padded = new cv.Mat()
          try {
            const scale = 66 / (maxY - minY)
            cv.resize(
              cropped,
              resized,
              new cv.Size(Math.max(1, Math.round((maxX - minX) * scale)), 66),
              0,
              0,
              cv.INTER_CUBIC,
            )
            cv.bitwise_not(resized, resized)
            cv.copyMakeBorder(resized, padded, 20, 20, 24, 24, cv.BORDER_CONSTANT, new cv.Scalar(255))
            cells.push({
              index,
              rect: { x, y, w, h },
              empty: false,
              digitHint,
              width: padded.cols,
              height: padded.rows,
              data: new Uint8Array(padded.data),
              ambiguous: keep.size > 2 || ink / (w * h) > 0.42,
            })
          } finally {
            cropped.delete()
          }
        } finally {
          roi.delete()
          labels.delete()
          stats.delete()
          centers.delete()
          distance.delete()
          glyph.delete()
          resized?.delete()
          padded?.delete()
        }
      }
    return { width: side, height: side, data: new Uint8ClampedArray(rectified.data), cells }
  } finally {
    rectified.delete()
    cleaned.delete()
    binary?.delete()
  }
}

self.onmessage = async ({ data: message }) => {
  let src
  try {
    const cv = await getCV()
    src = cv.matFromImageData(message.image)
    const result =
      message.type === 'detect' ? detect(cv, src) : prepare(cv, src, message.corners, message.size)
    const transfer = []
    if (result.data) transfer.push(result.data.buffer)
    if (result.cells) for (const cell of result.cells) if (cell.data) transfer.push(cell.data.buffer)
    self.postMessage({ id: message.id, result }, transfer)
  } catch (error) {
    self.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    src?.delete()
  }
}
