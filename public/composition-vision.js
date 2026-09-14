/* Geometry is inferred from cell contours, then verified against grid-line evidence.
   No digit recognition or solver guesses participate in the layout decision. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] || 0
}
function intersection(a, b) {
  const [p, q] = a,
    [r, s] = b
  const dx = q.x - p.x,
    dy = q.y - p.y,
    ex = s.x - r.x,
    ey = s.y - r.y
  const det = dx * ey - dy * ex
  if (Math.abs(det) < 1e-6) return null
  const t = ((r.x - p.x) * ey - (r.y - p.y) * ex) / det
  return { x: p.x + t * dx, y: p.y + t * dy }
}
function detectComposition(cv, src) {
  const gray = new cv.Mat(),
    binary = new cv.Mat(),
    contours = new cv.MatVector(),
    hierarchy = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 5)
  } finally {
    gray.delete()
  }
  const repair = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
  try {
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, repair)
  } finally {
    repair.delete()
  }
  const candidates = []
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i),
        approx = new cv.Mat()
      try {
        const area = cv.contourArea(contour)
        if (area < 60 || area > src.rows * src.cols * 0.018) continue
        cv.approxPolyDP(contour, approx, cv.arcLength(contour, true) * 0.04, true)
        if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue
        const points = ordered(
          Array.from({ length: 4 }, (_, j) => ({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })),
        )
        const w = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
        const h = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y)
        if (w / h < 0.55 || w / h > 1.8 || w < 8 || h < 8) continue
        candidates.push({
          points,
          area,
          pitch: Math.sqrt(area),
          center: {
            x: points.reduce((a, p) => a + p.x, 0) / 4,
            y: points.reduce((a, p) => a + p.y, 0) / 4,
          },
        })
      } finally {
        contour.delete()
        approx.delete()
      }
    }
  } finally {
    binary.delete()
    contours.delete()
    hierarchy.delete()
  }
  if (candidates.length < 100) return null
  const bins = new Map()
  for (const c of candidates) {
    const bin = Math.round(Math.log2(c.pitch) * 5)
    bins.set(bin, (bins.get(bin) || 0) + 1)
  }
  const dominant = [...bins].sort((a, b) => b[1] - a[1])[0][0]
  const pitch = 2 ** (dominant / 5)
  const cells = candidates.filter((c) => c.pitch > pitch * 0.72 && c.pitch < pitch * 1.3)
  if (cells.length < 100) return null
  // The four longest near-horizontal/vertical convex-hull edges provide the
  // virtual page rectangle even when its corners contain no actual cells.
  const points = cv.matFromArray(
    cells.length * 4,
    1,
    cv.CV_32FC2,
    cells.flatMap((c) => c.points.flatMap((p) => [p.x, p.y])),
  )
  const hull = new cv.Mat()
  let corners
  try {
    cv.convexHull(points, hull, false, true)
    const ps = Array.from({ length: hull.rows }, (_, i) => ({
      x: hull.data32F[i * 2],
      y: hull.data32F[i * 2 + 1],
    }))
    const horizontal = [],
      vertical = []
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i],
        b = ps[(i + 1) % ps.length],
        dx = Math.abs(a.x - b.x),
        dy = Math.abs(a.y - b.y)
      if (dx > dy * 3 && dx > pitch * 4) horizontal.push([a, b])
      if (dy > dx * 3 && dy > pitch * 4) vertical.push([a, b])
    }
    if (horizontal.length < 2 || vertical.length < 2) return null
    horizontal.sort((a, b) => a[0].y + a[1].y - (b[0].y + b[1].y))
    vertical.sort((a, b) => a[0].x + a[1].x - (b[0].x + b[1].x))
    const top = horizontal[0],
      bottom = horizontal.at(-1),
      left = vertical[0],
      right = vertical.at(-1)
    corners = [
      intersection(top, left),
      intersection(top, right),
      intersection(bottom, right),
      intersection(bottom, left),
    ]
    if (
      corners.some(
        (p) => !p || p.x < -pitch || p.y < -pitch || p.x > src.cols + pitch || p.y > src.rows + pitch,
      )
    )
      return null
    // Contours trace the inside of border cells. Expand by half a line width.
    const center = {
      x: corners.reduce((s, p) => s + p.x, 0) / 4,
      y: corners.reduce((s, p) => s + p.y, 0) / 4,
    }
    corners = corners.map((p) => ({
      x: Math.max(0, Math.min(src.cols - 1, center.x + (p.x - center.x) * 1.004)),
      y: Math.max(0, Math.min(src.rows - 1, center.y + (p.y - center.y) * 1.004)),
    }))
  } finally {
    points.delete()
    hull.delete()
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const width = Math.round((distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2)
  const height = Math.round((distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2)
  const rectified = warp(cv, src, corners, width, height),
    grid = threshold(cv, rectified)
  try {
    const xp = lines(cv, grid, true),
      yp = lines(cv, grid, false)
    const step = (peaks) =>
      median(
        peaks
          .slice(1)
          .map((p, i) => p - peaks[i])
          .filter((d) => d > pitch * 0.45),
      )
    const sx = step(xp),
      sy = step(yp)
    const lattice = (peaks, pitch, extent) => {
      if (peaks.length < 8 || !pitch) return []
      const ps = [...peaks]
      if (ps[0] > pitch * 0.55) ps.unshift(0)
      if (extent - 1 - ps.at(-1) > pitch * 0.55) ps.push(extent - 1)
      const result = [ps[0]]
      for (let i = 1; i < ps.length; i++) {
        const count = Math.max(1, Math.round((ps[i] - ps[i - 1]) / pitch))
        for (let j = 1; j <= count; j++) result.push(ps[i - 1] + ((ps[i] - ps[i - 1]) * j) / count)
      }
      return result.map(Math.round)
    }
    const xs = lattice(xp, sx, width),
      ys = lattice(yp, sy, height)
    const cols = xs.length - 1,
      rows = ys.length - 1
    if (!sx || !sy || cols < 9 || rows < 9 || cols > 90 || rows > 90 || cols % 3 || rows % 3) return null
    const edge = (x0, y0, x1, y1) => {
      let hits = 0,
        total = 0
      const vertical = x0 === x1,
        tolerance = Math.max(2, Math.round((vertical ? sx : sy) * 0.15))
      for (let t = 0.12; t <= 0.88; t += 0.04) {
        const x = Math.round(x0 + (x1 - x0) * t),
          y = Math.round(y0 + (y1 - y0) * t)
        let found = false
        for (let k = -tolerance; k <= tolerance; k++) {
          const px = vertical ? x + k : x,
            py = vertical ? y : y + k
          if (px >= 0 && py >= 0 && px < width && py < height && grid.data[py * width + px]) {
            found = true
            break
          }
        }
        if (found) hits++
        total++
      }
      return hits / total
    }
    const observed = new Set()
    const originPoints = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      corners.flatMap((p) => [p.x, p.y]),
    )
    const targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      width - 1,
      0,
      width - 1,
      height - 1,
      0,
      height - 1,
    ])
    const flatten = cv.getPerspectiveTransform(originPoints, targetPoints)
    try {
      const m = flatten.data64F
      for (const cell of cells) {
        const { x, y } = cell.center,
          z = m[6] * x + m[7] * y + m[8]
        const px = (m[0] * x + m[1] * y + m[2]) / z,
          py = (m[3] * x + m[4] * y + m[5]) / z
        const c = xs.findIndex((v) => v > px) - 1,
          r = ys.findIndex((v) => v > py) - 1
        if (c >= 0 && r >= 0 && c < cols && r < rows) observed.add(`${c},${r}`)
      }
    } finally {
      originPoints.delete()
      targetPoints.delete()
      flatten.delete()
    }
    const occupied = Array.from({ length: rows }, (_, r) =>
      Array.from(
        { length: cols },
        (_, c) =>
          observed.has(`${c},${r}`) ||
          Math.min(
            edge(xs[c], ys[r], xs[c + 1], ys[r]),
            edge(xs[c], ys[r + 1], xs[c + 1], ys[r + 1]),
            edge(xs[c], ys[r], xs[c], ys[r + 1]),
            edge(xs[c + 1], ys[r], xs[c + 1], ys[r + 1]),
          ) > 0.48,
      ),
    )
    const found = [],
      scores = new Map()
    for (let y = 0; y <= rows - 9; y += 3)
      for (let x = 0; x <= cols - 9; x += 3) {
        let count = 0
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (occupied[y + r][x + c]) count++
        scores.set(`${x},${y}`, count)
        if (count >= 76) found.push({ x, y, confidence: count / 81 })
      }
    const templates = [
      [
        [0, 0],
        [6, 6],
      ],
      [
        [0, 0],
        [12, 0],
        [6, 6],
        [0, 12],
        [12, 12],
      ],
      [
        [0, 0],
        [12, 0],
        [6, 6],
        [0, 12],
        [12, 12],
        [6, 18],
        [0, 24],
        [12, 24],
      ],
    ]
    for (let template of templates)
      for (let rotation = 0; rotation < 4; rotation++) {
        const tw = Math.max(...template.map((p) => p[0])) + 9,
          th = Math.max(...template.map((p) => p[1])) + 9
        if (
          tw === cols &&
          th === rows &&
          found.length >= template.length * 0.75 &&
          found.every((b) => template.some(([x, y]) => x === b.x && y === b.y)) &&
          template.every(([x, y]) => (scores.get(`${x},${y}`) || 0) >= 61)
        ) {
          for (const [x, y] of template)
            if (!found.some((b) => b.x === x && b.y === y))
              found.push({ x, y, confidence: scores.get(`${x},${y}`) / 81 })
        }
        template = template.map(([x, y]) => [th - y - 9, x])
      }
    found.sort((a, b) => a.y - b.y || a.x - b.x)
    if (found.length < 2) return null
    const from = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      width - 1,
      0,
      width - 1,
      height - 1,
      0,
      height - 1,
    ])
    const to = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      corners.flatMap((p) => [p.x, p.y]),
    )
    const transform = cv.getPerspectiveTransform(from, to)
    try {
      const m = transform.data64F
      const project = (x, y) => {
        const z = m[6] * x + m[7] * y + m[8]
        return { x: (m[0] * x + m[1] * y + m[2]) / z, y: (m[3] * x + m[4] * y + m[5]) / z }
      }
      return found.map((b) => ({
        ...b,
        corners: [
          project(xs[b.x], ys[b.y]),
          project(xs[b.x + 9], ys[b.y]),
          project(xs[b.x + 9], ys[b.y + 9]),
          project(xs[b.x], ys[b.y + 9]),
        ],
      }))
    } finally {
      from.delete()
      to.delete()
      transform.delete()
    }
  } finally {
    rectified.delete()
    grid.delete()
  }
}
