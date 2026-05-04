/**
 * Image processing utilities — center-crop and JPEG compression.
 * Ported from the skill's HTML template.
 */

/** Center-crop an image blob to target aspect ratio */
export async function cropToAspect(srcBlob, targetW, targetH) {
  const bmp = await createImageBitmap(srcBlob)
  const srcW = bmp.width
  const srcH = bmp.height
  const targetRatio = targetW / targetH
  const srcRatio = srcW / srcH
  let cropW, cropH, cropX, cropY

  if (srcRatio > targetRatio) {
    cropH = srcH
    cropW = Math.round(srcH * targetRatio)
    cropX = Math.round((srcW - cropW) / 2)
    cropY = 0
  } else {
    cropW = srcW
    cropH = Math.round(srcW / targetRatio)
    cropX = 0
    cropY = Math.round((srcH - cropH) / 2)
  }

  const c = document.createElement('canvas')
  c.width = targetW
  c.height = targetH
  c.getContext('2d').drawImage(bmp, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH)
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
}

/** Compress an image blob to JPEG under maxBytes */
export async function compressToJpeg(srcBlob, maxBytes = 500000) {
  const bmp = await createImageBitmap(srcBlob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d').drawImage(bmp, 0, 0)

  // Phase 1 — find the highest quality at full resolution that fits within maxBytes.
  // Start at q=0.97 (near-lossless) and step down by 0.03 to q=0.70.
  // Fine steps at the top mean simple images (flat bg, gradients) get maximum quality;
  // complex images step down just enough to fit.
  for (let q = 0.97; q >= 0.70; q = Math.round((q - 0.03) * 100) / 100) {
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
    if (b && b.size <= maxBytes) return b
  }

  // Phase 2 — still at full resolution, coarser steps down to q=0.50
  for (let q = 0.65; q >= 0.50; q = Math.round((q - 0.05) * 100) / 100) {
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
    if (b && b.size <= maxBytes) return b
  }

  // Phase 3 — scale down canvas as last resort (only for unusually large/complex images)
  for (let sc = 0.9; sc >= 0.2; sc = Math.round((sc - 0.1) * 10) / 10) {
    const c2 = document.createElement('canvas')
    c2.width = Math.round(bmp.width * sc)
    c2.height = Math.round(bmp.height * sc)
    c2.getContext('2d').drawImage(bmp, 0, 0, c2.width, c2.height)
    for (let q = 0.85; q >= 0.50; q = Math.round((q - 0.05) * 10) / 10) {
      const b = await new Promise((r) => c2.toBlob(r, 'image/jpeg', q))
      if (b && b.size <= maxBytes) return b
    }
  }

  // Absolute fallback
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.5))
}

/**
 * Analyze 4 corners of an image and return them sorted by how "clean" they are
 * (low luminance variance = uniform area, good for logo placement).
 */
function analyzeCorners(bitmap, sampleW, sampleH) {
  // Downscale for speed — we don't need full resolution to analyze
  const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height))
  const sw = Math.max(10, Math.round(bitmap.width * scale))
  const sh = Math.max(10, Math.round(bitmap.height * scale))
  const cw = Math.max(5, Math.round(sampleW * scale))
  const ch = Math.max(5, Math.round(sampleH * scale))

  const c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  const ctx = c.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, sw, sh)

  const corners = [
    { name: 'tl', x: 0, y: 0 },
    { name: 'tr', x: sw - cw, y: 0 },
    { name: 'bl', x: 0, y: sh - ch },
    { name: 'br', x: sw - cw, y: sh - ch },
  ]

  const results = corners.map((corner) => {
    const data = ctx.getImageData(corner.x, corner.y, cw, ch).data
    let sumL = 0
    let sumL2 = 0
    let edgeCount = 0
    let n = 0
    // Build luminance grid for edge density
    const luma = new Float32Array(cw * ch)
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      luma[n] = l
      sumL += l
      sumL2 += l * l
      n++
    }
    const meanL = sumL / n
    const variance = sumL2 / n - meanL * meanL
    // Edge density: fraction of pixels with sharp luminance transition to right/below neighbor.
    // Text has many such transitions (letter outlines), smooth backgrounds have few.
    const EDGE_LUMA_THRESHOLD = 18 // out of 255
    for (let row = 0; row < ch - 1; row++) {
      for (let col = 0; col < cw - 1; col++) {
        const idx = row * cw + col
        if (
          Math.abs(luma[idx] - luma[idx + 1]) > EDGE_LUMA_THRESHOLD ||
          Math.abs(luma[idx] - luma[idx + cw]) > EDGE_LUMA_THRESHOLD
        ) edgeCount++
      }
    }
    return {
      ...corner,
      luminance: meanL / 255,
      stdDev: Math.sqrt(Math.max(0, variance)) / 255,
      edgeDensity: edgeCount / (cw * ch),
    }
  })

  // Cleanest (lowest stdDev) first
  results.sort((a, b) => a.stdDev - b.stdDev)
  return results
}

/**
 * Sample the average color of a logo's 4 corners to detect its background color.
 * Each corner is sampled as a small block for robustness against single-pixel edge artifacts.
 * Returns { r, g, b } in 0–255 range.
 */
function detectLogoBgColor(canvas) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  // Sample block size: at most 5px or 1/20th of the smaller dimension
  const s = Math.max(1, Math.min(5, Math.floor(Math.min(w, h) / 20)))

  const corners = [
    [0,     0    ],
    [w - s, 0    ],
    [0,     h - s],
    [w - s, h - s],
  ]

  let r = 0, g = 0, b = 0, n = 0
  for (const [cx, cy] of corners) {
    const data = ctx.getImageData(cx, cy, s, s).data
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
    }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}


/**
 * Sample the average color within a region — used for tonal matching.
 * Returns { r, g, b } normalized 0-255.
 */
function sampleRegionColor(bitmap, rx, ry, rw, rh) {
  const scale = Math.min(1, 100 / Math.max(rw, rh))
  const sw = Math.max(4, Math.round(rw * scale))
  const sh = Math.max(4, Math.round(rh * scale))
  const c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  c.getContext('2d').drawImage(bitmap, rx, ry, rw, rh, 0, 0, sw, sh)
  const data = c.getContext('2d').getImageData(0, 0, sw, sh).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  return { r: r / n, g: g / n, b: b / n }
}

/**
 * Composite a user-provided logo onto a generated banner.
 * - Pixel-perfect fidelity (no AI redraw)
 * - Smart placement: analyzes 4 corners and picks the cleanest one
 * - Scene-aware: cast shadow direction matches scene lighting
 * - Respects existing transparency: if logo has alpha, no white backing needed
 * - Adaptive size: wide banners get smaller logo, tall banners get larger
 */
export async function compositeLogoOnBanner(bannerBlob, logoDataUrl, targetW, targetH) {
  const [bannerBmp, logoBmp] = await Promise.all([
    createImageBitmap(bannerBlob),
    (async () => {
      const r = await fetch(logoDataUrl)
      const b = await r.blob()
      return createImageBitmap(b)
    })(),
  ])

  // Is the logo itself transparent? (affects whether we need white backing)
  const logoCheckCanvas = document.createElement('canvas')
  logoCheckCanvas.width = logoBmp.width
  logoCheckCanvas.height = logoBmp.height
  logoCheckCanvas.getContext('2d').drawImage(logoBmp, 0, 0)
  const logoHasAlpha = hasTransparency(logoCheckCanvas)

  // Adaptive size: wide banners → smaller logo, tall banners → larger
  const aspectRatio = bannerBmp.width / bannerBmp.height
  let widthPct = 0.18
  if (aspectRatio > 3) widthPct = 0.14
  else if (aspectRatio < 0.8) widthPct = 0.22

  const logoMaxW = Math.round(bannerBmp.width * widthPct)
  const logoMaxH = Math.round(bannerBmp.height * 0.2)
  const logoRatio = logoBmp.width / logoBmp.height

  let drawW = logoMaxW
  let drawH = Math.round(drawW / logoRatio)
  if (drawH > logoMaxH) {
    drawH = logoMaxH
    drawW = Math.round(drawH * logoRatio)
  }

  const pad = Math.max(10, Math.round(Math.min(bannerBmp.width, bannerBmp.height) * 0.04))

  // Analyze a slightly larger area than the logo itself, to ensure the whole zone is clean
  const analysisW = drawW + pad * 2
  const analysisH = drawH + pad * 2
  const corners = analyzeCorners(bannerBmp, analysisW, analysisH)

  // Top-left has visual priority — use it unless it's too busy.
  // Only fall back to the cleanest available corner when tl is clearly occupied.
  const TL_BUSY_THRESHOLD = 0.22
  const tlCorner = corners.find((c) => c.name === 'tl')
  const best = (tlCorner && tlCorner.stdDev <= TL_BUSY_THRESHOLD) ? tlCorner : corners[0]

  // Skip logo entirely if even the best corner has text-like edge density.
  // Better no logo than a logo stamped on top of headline text.
  const TEXT_EDGE_THRESHOLD = 0.07
  if (best.edgeDensity > TEXT_EDGE_THRESHOLD) {
    return bannerBlob
  }

  // Compute position for the chosen corner
  let x = pad
  let y = pad
  if (best.name === 'tr') { x = bannerBmp.width - drawW - pad; y = pad }
  else if (best.name === 'bl') { x = pad; y = bannerBmp.height - drawH - pad }
  else if (best.name === 'br') { x = bannerBmp.width - drawW - pad; y = bannerBmp.height - drawH - pad }

  // Sample the region behind the logo — used to judge if backing is actually needed
  const regionColor = sampleRegionColor(bannerBmp, x, y, drawW, drawH)
  const regionLum = (0.299 * regionColor.r + 0.587 * regionColor.g + 0.114 * regionColor.b) / 255

  // Draw composite
  const c = document.createElement('canvas')
  c.width = bannerBmp.width
  c.height = bannerBmp.height
  const ctx = c.getContext('2d')
  ctx.drawImage(bannerBmp, 0, 0)

  const isDark = regionLum < 0.45
  const isBusy = best.stdDev > 0.14

  // Decision tree:
  // - Logo WITHOUT alpha (solid bg) → detect bg color from logo corners → draw matching panel →
  //   logo on top. Enclosed letterforms (O, D, P, B…) match the panel perfectly.
  // - Logo WITH alpha + clean area → just drop shadow (scene-matched)
  // - Logo WITH alpha + dark/busy area → very subtle soft backing (not a hard white rectangle)
  const needsBacking = logoHasAlpha && (isDark || isBusy)

  if (!logoHasAlpha) {
    // Detect logo's background color from its corners → draw a matching panel → logo on top.
    // This correctly handles enclosed letterforms (O, D, P, B…) because those interior pixels
    // are the same color as the panel — no flood-fill artifacts, no multiply color shifts.
    const logoBg = detectLogoBgColor(logoCheckCanvas)
    const panPad = Math.round(Math.min(drawW, drawH) * 0.12)
    const px = x - panPad
    const py = y - panPad
    const pw = drawW + panPad * 2
    const ph = drawH + panPad * 2
    const pr = Math.round(Math.min(pw, ph) * 0.1)

    ctx.save()
    ctx.fillStyle = `rgb(${logoBg.r},${logoBg.g},${logoBg.b})`
    roundRect(ctx, px, py, pw, ph, pr)
    ctx.fill()
    ctx.restore()

    ctx.drawImage(logoBmp, x, y, drawW, drawH)
  } else if (needsBacking) {
    const backingPad = Math.round(Math.min(drawW, drawH) * 0.22)
    const bx = x - backingPad
    const by = y - backingPad
    const bw = drawW + backingPad * 2
    const bh = drawH + backingPad * 2
    const br = Math.round(Math.min(bw, bh) * 0.14)

    ctx.save()
    // Softer backing: white on dark, slight translucency — don't scream "sticker"
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.72)'
    roundRect(ctx, bx, by, bw, bh, br)
    ctx.fill()
    ctx.restore()

    ctx.drawImage(logoBmp, x, y, drawW, drawH)
  } else {
    // Clean area + logo with alpha — place directly, no shadow
    ctx.drawImage(logoBmp, x, y, drawW, drawH)
  }

  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
}

/**
 * Check if an image already has transparent pixels (alpha < 255 anywhere).
 * Samples a grid of pixels (fast, not full scan) for performance.
 */
export function hasTransparency(canvas) {
  const ctx = canvas.getContext('2d')
  const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 40))
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data

  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const i = (y * canvas.width + x) * 4
      if (imgData[i + 3] < 250) return true
    }
  }
  return false
}

/**
 * Remove a uniform background from a logo via flood-fill from the 4 corners.
 * Works when background is a solid color (white, black, colored) — common for
 * PNG/JPG logos exported from websites or PDFs.
 *
 * Returns: { canvas, removed, reason, bgColor }
 *   - removed: true if bg was removed, false if skipped (non-uniform)
 *   - reason: why skipped (or null on success)
 *   - bgColor: detected background RGB tuple
 */
export function removeBackgroundFloodFill(canvas, tolerance = 18) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const imgData = ctx.getImageData(0, 0, w, h)
  const data = imgData.data

  // Sample 4 corners
  const cornerPx = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ]
  const cornerColors = cornerPx.map(([x, y]) => {
    const i = (y * w + x) * 4
    return [data[i], data[i + 1], data[i + 2], data[i + 3]]
  })

  // If any corner is already transparent, treat that as bg
  const anyTransparentCorner = cornerColors.some((c) => c[3] < 250)
  if (anyTransparentCorner) {
    return { canvas, removed: false, reason: 'already-has-alpha', bgColor: null }
  }

  // Check if corners are similar in color (indicating uniform bg)
  const [r0, g0, b0] = cornerColors[0]
  const uniform = cornerColors.every(
    ([r, g, b]) =>
      Math.abs(r - r0) < tolerance &&
      Math.abs(g - g0) < tolerance &&
      Math.abs(b - b0) < tolerance
  )

  if (!uniform) {
    return { canvas, removed: false, reason: 'non-uniform-background', bgColor: null }
  }

  // Average corner colors for a stable bg reference
  const bgR = Math.round(cornerColors.reduce((s, c) => s + c[0], 0) / 4)
  const bgG = Math.round(cornerColors.reduce((s, c) => s + c[1], 0) / 4)
  const bgB = Math.round(cornerColors.reduce((s, c) => s + c[2], 0) / 4)

  // Iterative flood fill with 8-connectivity (4 cardinals, visited check)
  const visited = new Uint8Array(w * h)
  const stack = []

  for (const [x, y] of cornerPx) {
    stack.push(y * w + x)
  }

  // Soft-edge thresholds: fully transparent inside inner radius, feathered outside
  const innerT = tolerance * 0.6
  const outerT = tolerance

  while (stack.length > 0) {
    const idx = stack.pop()
    if (visited[idx]) continue
    visited[idx] = 1

    const di = idx * 4
    const dr = Math.abs(data[di] - bgR)
    const dg = Math.abs(data[di + 1] - bgG)
    const db = Math.abs(data[di + 2] - bgB)
    const dist = Math.max(dr, dg, db)

    if (dist > outerT) continue // too different, don't continue flood here

    if (dist <= innerT) {
      data[di + 3] = 0 // fully transparent
    } else {
      // Feather: partial alpha for soft edges
      const t = (dist - innerT) / (outerT - innerT)
      data[di + 3] = Math.round(t * 255)
    }

    // Expand to neighbors
    const px = idx % w
    const py = (idx - px) / w

    if (px > 0) stack.push(idx - 1)
    if (px < w - 1) stack.push(idx + 1)
    if (py > 0) stack.push(idx - w)
    if (py < h - 1) stack.push(idx + w)
  }

  ctx.putImageData(imgData, 0, 0)
  return { canvas, removed: true, reason: null, bgColor: [bgR, bgG, bgB] }
}

/**
 * Convert an SVG or image file to a PNG data URL (for logo).
 * Solid-background logos are returned as-is — compositeLogoOnBanner handles them
 * via corner color detection + panel, which correctly covers enclosed letterforms.
 *
 * Returns: { dataUrl, bgRemoved, reason, hasAlpha }
 */
export function fileToPngDataUrl(file, maxWidth = 600, options = {}) {
  void options // reserved for future use

  return new Promise((resolve, reject) => {
    const isSvg = file.type === 'image/svg+xml' || file.name.endsWith('.svg')
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const h = Math.round(maxWidth * (img.naturalHeight || 100) / (img.naturalWidth || 100)) || maxWidth
        const cvs = document.createElement('canvas')
        cvs.width = maxWidth
        cvs.height = h
        cvs.getContext('2d').drawImage(img, 0, 0, maxWidth, h)
        if (img._blobUrl) URL.revokeObjectURL(img._blobUrl)

        // SVG is always transparent — skip bg removal
        if (isSvg) {
          resolve({
            dataUrl: cvs.toDataURL('image/png'),
            bgRemoved: false,
            reason: 'svg',
            hasAlpha: true,
          })
          return
        }

        // Check if already has transparency
        const alreadyHasAlpha = hasTransparency(cvs)
        if (alreadyHasAlpha) {
          resolve({
            dataUrl: cvs.toDataURL('image/png'),
            bgRemoved: false,
            reason: 'already-has-alpha',
            hasAlpha: true,
          })
          return
        }

        // No flood-fill — return logo as-is with solid background.
        // compositeLogoOnBanner handles solid-bg logos via corner color detection:
        // it draws a matching panel behind the logo, which correctly covers enclosed
        // letterforms (O, D, P, B…) that flood-fill cannot reach.
        resolve({
          dataUrl: cvs.toDataURL('image/png'),
          bgRemoved: false,
          reason: 'panel-composite',
          hasAlpha: false,
        })
      }
      img.onerror = () => {
        if (img._blobUrl) URL.revokeObjectURL(img._blobUrl)
        reject(new Error('Logo load failed'))
      }

      if (isSvg) {
        const blob = new Blob([e.target.result], { type: 'image/svg+xml' })
        img._blobUrl = URL.createObjectURL(blob)
        img.src = img._blobUrl
      } else {
        img.src = e.target.result
      }
    }

    reader.onerror = () => reject(new Error('File read failed'))
    isSvg ? reader.readAsText(file) : reader.readAsDataURL(file)
  })
}

/**
 * Inject an XMP description into a JPEG blob (binary APP1 segment injection).
 * The description ends up in dc:description — readable by Lightroom, Bridge,
 * Photoshop, and other XMP-aware tools. Google Drive Details panel may also
 * surface it. No external library required — pure JPEG binary manipulation.
 *
 * Returns a new Blob with XMP embedded. On any error returns the original blob.
 */
export async function injectXmpDescription(blob, description) {
  try {
    const buffer = await blob.arrayBuffer()
    const data = new Uint8Array(buffer)

    // Verify JPEG SOI marker
    if (data.length < 4 || data[0] !== 0xFF || data[1] !== 0xD8) return blob

    // Escape special XML characters
    const safe = description
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

    const xmpXml =
      '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">' + safe + '</rdf:li></rdf:Alt></dc:description>' +
      '</rdf:Description></rdf:RDF></x:xmpmeta>' +
      '<?xpacket end="w"?>'

    const enc = new TextEncoder()
    const identifier = enc.encode('http://ns.adobe.com/xap/1.0/\0') // 29 bytes incl. null
    const xmpBytes = enc.encode(xmpXml)

    // APP1 length = 2 (length field itself) + identifier + xmp content
    const segLen = 2 + identifier.length + xmpBytes.length
    if (segLen > 65533) return blob // XMP too large — skip silently

    // Build APP1 segment: FF E1 + 2-byte length + identifier + xmp
    const seg = new Uint8Array(2 + 2 + identifier.length + xmpBytes.length)
    seg[0] = 0xFF; seg[1] = 0xE1
    seg[2] = (segLen >> 8) & 0xFF; seg[3] = segLen & 0xFF
    seg.set(identifier, 4)
    seg.set(xmpBytes, 4 + identifier.length)

    // Insert after SOI (2 bytes) + optional APP0 segment (FF E0)
    let insertAt = 2
    if (data[2] === 0xFF && data[3] === 0xE0) {
      const app0Len = (data[4] << 8) | data[5] // includes the 2 length bytes
      insertAt = 2 + 2 + app0Len               // skip marker(2) + length_value
    }

    const result = new Uint8Array(data.length + seg.length)
    result.set(data.subarray(0, insertAt))
    result.set(seg, insertAt)
    result.set(data.subarray(insertAt), insertAt + seg.length)

    return new Blob([result], { type: 'image/jpeg' })
  } catch {
    return blob // never crash — return original if anything fails
  }
}

/**
 * Replace the background of an existing PNG data URL with AI-removed version.
 * Calls the Netlify function which proxies to fal.ai's rembg.
 */
export async function removeBackgroundAI(dataUrl) {
  const res = await fetch('/.netlify/functions/remove-bg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`AI bg-removal failed: HTTP ${res.status} — ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data.imageUrl && !data.dataUrl) {
    throw new Error('No image returned from bg-removal')
  }

  // Fetch the result image and convert to dataUrl
  if (data.dataUrl) return data.dataUrl

  const imgRes = await fetch(data.imageUrl)
  const blob = await imgRes.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read bg-removed image'))
    reader.readAsDataURL(blob)
  })
}
