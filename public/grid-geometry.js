/* Track separators on the unfiltered photograph, independently of its digits.
   Shared intersections form a continuous mesh of blocks and individual cells. */
function traceSeparator(mask, width, height, vertical, seed, radius, pitch, start, end, outer) {
  const length = vertical ? height : width,
    across = vertical ? width : height
  const lo = Math.max(0, Math.floor(seed - radius)),
    hi = Math.min(across - 1, Math.ceil(seed + radius)),
    count = hi - lo + 1
  const span = Math.max(4, Math.round(pitch * 0.3))
  const evidence = new Float32Array(length * count)
  // Longitudinal support rewards a separator continuing through many cells,
  // rather than a short vertical/horizontal stroke in a printed number.
  for (let p = lo; p <= hi; p++) {
    const prefix = new Float32Array(length + 1)
    for (let q = 0; q < length; q++) {
      let ink = 0
      for (let d = -1; d <= 1; d++) {
        const t = Math.max(0, Math.min(across - 1, p + d))
        ink += mask[vertical ? q * width + t : t * width + q] / 765
      }
      prefix[q + 1] = prefix[q] + ink
    }
    for (let q = 0; q < length; q++) {
      const a = Math.max(0, q - span),
        b = Math.min(length, q + span + 1)
      evidence[q * count + p - lo] = (prefix[b] - prefix[a]) / (b - a)
    }
  }
  const back = new Int16Array(length * count)
  let previous = new Float32Array(count)
  const endpointRadius = pitch * 0.1
  if (outer) for (let p = 0; p < count; p++) if (Math.abs(lo + p - seed) > endpointRadius) previous[p] = -1e6
  for (let q = start; q <= end; q++) {
    const next = new Float32Array(count)
    for (let p = 0; p < count; p++) {
      let best = -Infinity,
        parent = p
      for (let d = -1; d <= 1; d++) {
        const candidate = p + d
        if (candidate < 0 || candidate >= count) continue
        const score = previous[candidate] - Math.abs(d) * 0.06
        if (score > best) {
          best = score
          parent = candidate
        }
      }
      const prior = Math.abs(lo + p - seed) / Math.max(1, radius)
      next[p] = best + evidence[q * count + p] - prior * 0.012
      back[q * count + p] = parent
    }
    previous = next
  }
  let best = 0
  if (outer) for (let p = 0; p < count; p++) if (Math.abs(lo + p - seed) > endpointRadius) previous[p] = -1e6
  for (let p = 1; p < count; p++) if (previous[p] > previous[best]) best = p
  const raw = new Float32Array(length),
    support = new Float32Array(length)
  for (let q = end; q >= start; q--) {
    // Centre the path on the ink, also on thick block borders with a flat peak.
    let weight = 0,
      center = 0
    for (let d = -2; d <= 2; d++) {
      const p = best + d
      if (p < 0 || p >= count) continue
      const score = evidence[q * count + p]
      weight += score
      center += (lo + p) * score
    }
    raw[q] = weight > 0.05 ? center / weight : lo + best
    support[q] = evidence[q * count + best]
    best = back[q * count + best]
  }
  raw.fill(raw[start], 0, start)
  raw.fill(raw[end], end + 1)
  // A bowed outer edge may intersect this separator just outside the corner
  // rectangle. Extend its evidence together with its position into that margin.
  support.fill(support[start], 0, start)
  support.fill(support[end], end + 1)
  const path = new Float32Array(length)
  const smoothing = Math.max(1, Math.round(pitch * 0.12))
  for (let q = 0; q < length; q++) {
    let sum = 0,
      n = 0
    for (let d = -smoothing; d <= smoothing; d++) {
      sum += raw[Math.max(0, Math.min(length - 1, q + d))]
      n++
    }
    path[q] = sum / n
  }
  let supported = 0
  for (let q = start; q <= end; q++) if (support[q] > 0.12) supported++
  return { path, support, confidence: supported / (end - start + 1), seed, start, end }
}

function localGridMesh(mask, width, height, xs, ys, boxSize) {
  const size = xs.length - 1,
    pitch = (xs[size] - xs[0]) / size
  if (!Number.isInteger(boxSize) || boxSize < 2 || size % boxSize !== 0) throw new Error('Invalid block size')
  const at = (values, t) => values[Math.max(0, Math.min(values.length - 1, Math.round(t)))]
  const trace = (seeds, vertical) =>
    seeds.map((seed, i) => {
      const other = vertical ? ys : xs
      const radius = Math.min(
        pitch * 0.46,
        i ? (seed - seeds[i - 1]) * 0.46 : pitch * 0.46,
        i < size ? (seeds[i + 1] - seed) * 0.46 : pitch * 0.46,
      )
      return traceSeparator(
        mask,
        width,
        height,
        vertical,
        seed,
        radius,
        pitch,
        Math.max(0, Math.round(other[0])),
        Math.min((vertical ? height : width) - 1, Math.round(other[size])),
        i === 0 || i === size,
      )
    })
  const vertical = trace(xs, true),
    horizontal = trace(ys, false)
  const reliable = (line, t) => line.confidence >= 0.55 && at(line.support, t) > 0.1
  const position = (lines, i, t) => {
    const line = lines[i]
    if (i === 0 || i === size) {
      const neighbours = lines
        .slice(i === 0 ? 1 : size - boxSize, i === 0 ? boxSize + 1 : size)
        .filter((inner) => reliable(inner, t))
        .map((inner) => {
          // Global projection peaks can have a different offset on each line.
          // Compare curvature relative to the line's own two endpoints.
          const u = Math.max(0, Math.min(1, (t - inner.start) / (inner.end - inner.start)))
          const baseline = inner.path[inner.start] * (1 - u) + inner.path[inner.end] * u
          return at(inner.path, t) - baseline
        })
        .sort((a, b) => a - b)
      if (neighbours.length >= 2) {
        // Page/photo frames can be darker than the actual outer separator.
        // Its displacement must agree with the adjacent cell's curved edge.
        const predicted = line.seed + neighbours[Math.floor(neighbours.length / 2)]
        if (!reliable(line, t) || Math.abs(at(line.path, t) - predicted) > pitch * 0.12) return predicted
      }
    }
    if (i % boxSize === 0) return reliable(line, t) ? at(line.path, t) : line.seed
    // Missing/faint internal separators inherit the coordinates of their own
    // block's borders, not the average spacing of the whole photograph.
    const a = Math.floor(i / boxSize) * boxSize,
      b = a + boxSize,
      u = (i - a) / boxSize
    const left = position(lines, a, t),
      right = position(lines, b, t)
    const predicted = left * (1 - u) + right * u
    return reliable(line, t) && Math.abs(at(line.path, t) - predicted) < pitch * 0.22
      ? at(line.path, t)
      : predicted
  }
  const nodes = []
  for (let r = 0; r <= size; r++)
    for (let c = 0; c <= size; c++) {
      let x = xs[c],
        y = ys[r]
      for (let k = 0; k < 8; k++) {
        x = position(vertical, c, y)
        y = position(horizontal, r, x)
      }
      nodes.push({ x, y })
    }
  const quad = (r, c, step = 1) => [
    nodes[r * (size + 1) + c],
    nodes[r * (size + 1) + c + step],
    nodes[(r + step) * (size + 1) + c + step],
    nodes[(r + step) * (size + 1) + c],
  ]
  const blocks = []
  for (let r = 0; r < size; r += boxSize)
    for (let c = 0; c < size; c += boxSize)
      blocks.push({
        row: r,
        col: c,
        corners: quad(r, c, boxSize),
        confidence: Math.min(
          vertical[c].confidence,
          vertical[c + boxSize].confidence,
          horizontal[r].confidence,
          horizontal[r + boxSize].confidence,
        ),
      })
  // Never pass inverted, collapsed or implausibly stretched cells to the OCR.
  let valid = true
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const points = quad(r, c)
      for (let i = 0; i < 4; i++) {
        const a = points[i],
          b = points[(i + 1) % 4],
          d = points[(i + 2) % 4]
        const length = Math.hypot(b.x - a.x, b.y - a.y)
        if (
          length < pitch * 0.45 ||
          length > pitch * 1.7 ||
          (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x) <= 0
        )
          valid = false
      }
    }
  const support =
    Math.min(
      vertical.filter((l) => l.confidence >= 0.55).length,
      horizontal.filter((l) => l.confidence >= 0.55).length,
    ) /
    (size + 1)
  const offsets = nodes
    .map((p, i) =>
      Math.max(Math.abs(p.x - xs[i % (size + 1)]), Math.abs(p.y - ys[Math.floor(i / (size + 1))])),
    )
    .sort((a, b) => a - b)
  // Do not resample already aligned print for sub-stroke-sized adjustments.
  const displaced = offsets[Math.floor(offsets.length * 0.9)] > pitch * 0.15
  const corrected = valid && support >= 0.7 && displaced
  return { nodes, blocks, corrected, support, uncertain: displaced && !corrected }
}

function rectifyLocalGrid(cv, source, side, padding, size, boxSize) {
  const roi = source.roi(new cv.Rect(padding, padding, side, side))
  const global = new cv.Mat()
  roi.copyTo(global)
  roi.delete()
  const binary = threshold(cv, source, 5, 51),
    reduced = new cv.Mat()
  const central = threshold(cv, global)
  let mapX, mapY, corrected
  try {
    const xs = boundaries(lines(cv, central, true), size, side),
      ys = boundaries(lines(cv, central, false), size, side)
    const target = Math.round((source.cols * size * 32) / side)
    cv.resize(binary, reduced, new cv.Size(target, target), 0, 0, cv.INTER_AREA)
    const scale = source.cols / target
    const mesh = localGridMesh(
      reduced.data,
      target,
      target,
      xs.map((x) => (x + padding + 0.5) / scale - 0.5),
      ys.map((y) => (y + padding + 0.5) / scale - 0.5),
      boxSize,
    )
    const point = (p) => ({ x: (p.x + 0.5) * scale - 0.5, y: (p.y + 0.5) * scale - 0.5 })
    const nodes = mesh.nodes.map(point)
    const geometry = {
      corrected: mesh.corrected,
      uncertain: mesh.uncertain,
      support: mesh.support,
      boxSize,
      blocks: mesh.blocks.map((b) => ({
        ...b,
        corners: b.corners.map((p) => {
          const q = point(p)
          return { x: q.x - padding, y: q.y - padding }
        }),
      })),
    }
    if (!mesh.corrected) return { image: global, xs, ys, geometry }
    mapX = new cv.Mat(side, side, cv.CV_32FC1)
    mapY = new cv.Mat(side, side, cv.CV_32FC1)
    const pitch = (side - 1) / size
    for (let y = 0; y < side; y++) {
      const r = Math.min(size - 1, Math.floor(y / pitch)),
        v = y / pitch - r
      for (let x = 0; x < side; x++) {
        const c = Math.min(size - 1, Math.floor(x / pitch)),
          u = x / pitch - c
        const a = nodes[r * (size + 1) + c],
          b = nodes[r * (size + 1) + c + 1],
          d = nodes[(r + 1) * (size + 1) + c],
          e = nodes[(r + 1) * (size + 1) + c + 1]
        const p = y * side + x
        mapX.data32F[p] = (1 - v) * ((1 - u) * a.x + u * b.x) + v * ((1 - u) * d.x + u * e.x)
        mapY.data32F[p] = (1 - v) * ((1 - u) * a.y + u * b.y) + v * ((1 - u) * d.y + u * e.y)
      }
    }
    corrected = new cv.Mat()
    cv.remap(
      source,
      corrected,
      mapX,
      mapY,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    )
    global.delete()
    const separators = Array.from({ length: size + 1 }, (_, i) => Math.round(i * pitch))
    return { image: corrected, xs: separators, ys: separators, geometry }
  } catch (error) {
    global.delete()
    corrected?.delete()
    throw error
  } finally {
    binary.delete()
    central.delete()
    reduced.delete()
    mapX?.delete()
    mapY?.delete()
  }
}
