/* Printed-mode evidence is relative to the local paper and the font on this
   photograph. A dark page border is not evidence of a digit inside a cell. */
function preserveBlackPrint(cv, image, coloured, xs, ys, size) {
  // Camera colour noise can tint isolated pixels of black print blue. Assess
  // these pixels within the intact ink component before erasing coloured notes.
  const mask = threshold(cv, image, 5, 51)
  const labels = new cv.Mat(),
    stats = new cv.Mat(),
    centers = new cv.Mat()
  try {
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const inset = Math.max(4, Math.round((image.cols / size) * 0.055))
        const x = xs[col] + inset,
          y = ys[row] + inset
        const w = Math.max(2, xs[col + 1] - xs[col] - 2 * inset),
          h = Math.max(2, ys[row + 1] - ys[row] - 2 * inset)
        const roi = mask.roi(new cv.Rect(x, y, w, h))
        try {
          const count = cv.connectedComponentsWithStats(roi, labels, stats, centers, 8, cv.CV_32S)
          const ink = new Uint32Array(count),
            colour = new Uint32Array(count)
          for (let p = 0; p < labels.data32S.length; p++) {
            const label = labels.data32S[p],
              source = (y + Math.floor(p / w)) * image.cols + x + (p % w)
            if (label && image.data[source * 4] < 190) {
              ink[label]++
              if (coloured[source]) colour[label]++
            }
          }
          const keep = new Set()
          for (let n = 1; n < count; n++) {
            const height = stats.intAt(n, cv.CC_STAT_HEIGHT),
              width = stats.intAt(n, cv.CC_STAT_WIDTH)
            if (
              height >= h * 0.35 &&
              height <= h * 0.92 &&
              width <= w * 0.9 &&
              ink[n] >= w * h * 0.025 &&
              colour[n] <= ink[n] * 0.35
            )
              keep.add(n)
          }
          for (let p = 0; p < labels.data32S.length; p++)
            if (keep.has(labels.data32S[p])) coloured[(y + Math.floor(p / w)) * image.cols + x + (p % w)] = 0
        } finally {
          roi.delete()
        }
      }
    for (let p = 0; p < coloured.length; p++)
      if (coloured[p]) image.data[p * 4] = image.data[p * 4 + 1] = image.data[p * 4 + 2] = 255
  } finally {
    mask.delete()
    labels.delete()
    stats.delete()
    centers.delete()
  }
}

function printedGridFragment(left, top, width, height, cellWidth, cellHeight) {
  const verticalEdge = left < cellWidth * 0.07 || left + width > cellWidth * 0.93
  const horizontalEdge = top < cellHeight * 0.07 || top + height > cellHeight * 0.93
  return (
    (verticalEdge && height > cellHeight * 0.6 && width < cellWidth * 0.16) ||
    (horizontalEdge && width > cellWidth * 0.6 && height < cellHeight * 0.16)
  )
}

function filterPrintedCells(cells, size) {
  const candidates = cells.filter((c) => !c.empty)
  const heights = candidates.map((c) => c.relativeHeight).sort((a, b) => a - b)
  let cluster = []
  for (const candidate of candidates) {
    const nearby = candidates.filter(
      (c) => Math.abs(c.relativeHeight - candidate.relativeHeight) < candidate.relativeHeight * 0.12,
    )
    if (nearby.length > cluster.length) cluster = nearby
  }
  let minimumHeight = 0,
    maximumTone = 1,
    typicalStroke = Infinity
  if (cluster.length >= Math.max(6, size / 2) && cluster.length >= candidates.length * 0.35) {
    const typicalHeights = cluster.map((c) => c.relativeHeight).sort((a, b) => a - b)
    const tones = cluster.map((c) => c.meanTone).sort((a, b) => a - b)
    const strokes = cluster.map((c) => c.relativeStroke).sort((a, b) => a - b)
    minimumHeight = typicalHeights[Math.floor(typicalHeights.length / 2)] * 0.72
    maximumTone = tones[Math.floor(tones.length * 0.9)] + 0.065
    typicalStroke = strokes[Math.floor(strokes.length / 2)]
  }
  // Preserve the stronger separation already used on densely filled pages.
  if (heights.length >= size * size * 0.65)
    minimumHeight = Math.max(minimumHeight, heights[Math.floor(heights.length * 0.75)] * 0.88)
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const substantial = cell.reviewHeight >= minimumHeight || cell.reviewStroke >= typicalStroke * 0.85
    if (cell.empty) {
      if (!substantial) cell.ambiguous = false
      continue
    }
    const small = cell.relativeHeight < minimumHeight,
      faint = cell.meanTone > maximumTone
    if (small || faint)
      cells[i] = {
        index: cell.index,
        rect: cell.rect,
        empty: true,
        // Keep broken/clipped dark print for review; confidently excluded small
        // notes and clearly lighter ink do not need another manual decision.
        ambiguous: small ? substantial : cell.meanTone < maximumTone + 0.035,
      }
  }
}
