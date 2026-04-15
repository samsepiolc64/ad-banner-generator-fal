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

  for (let q = 0.9; q >= 0.55; q = Math.round((q - 0.05) * 100) / 100) {
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
    if (b && b.size <= maxBytes) return b
  }

  for (let sc = 0.9; sc >= 0.4; sc = Math.round((sc - 0.1) * 10) / 10) {
    const c2 = document.createElement('canvas')
    c2.width = Math.round(bmp.width * sc)
    c2.height = Math.round(bmp.height * sc)
    c2.getContext('2d').drawImage(bmp, 0, 0, c2.width, c2.height)
    const b = await new Promise((r) => c2.toBlob(r, 'image/jpeg', 0.75))
    if (b && b.size <= maxBytes) return b
  }

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
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      sumL += l
      sumL2 += l * l
      n++
    }
    const meanL = sumL / n
    const variance = sumL2 / n - meanL * meanL
    return {
      ...corner,
      luminance: meanL / 255,
      stdDev: Math.sqrt(Math.max(0, variance)) / 255,
    }
  })

  // Cleanest (lowest stdDev) first
  results.sort((a, b) => a.stdDev - b.stdDev)
  return results
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
 * Composite a user-provided logo onto a generated banner.
 * - Pixel-perfect fidelity (no AI redraw)
 * - Smart placement: analyzes 4 corners and picks the cleanest one
 * - Adapts to lightness: subtle white backing on dark areas, soft shadow on light areas
 * - Size adapts to banner aspect ratio (wider banners get smaller logo)
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
  const best = corners[0]

  // Compute position for the chosen corner
  let x = pad
  let y = pad
  if (best.name === 'tr') { x = bannerBmp.width - drawW - pad; y = pad }
  else if (best.name === 'bl') { x = pad; y = bannerBmp.height - drawH - pad }
  else if (best.name === 'br') { x = bannerBmp.width - drawW - pad; y = bannerBmp.height - drawH - pad }

  // Draw composite
  const c = document.createElement('canvas')
  c.width = bannerBmp.width
  c.height = bannerBmp.height
  const ctx = c.getContext('2d')
  ctx.drawImage(bannerBmp, 0, 0)

  const isDark = best.luminance < 0.45
  const isBusy = best.stdDev > 0.14

  // On dark OR busy areas — add subtle white rounded backing for legibility
  if (isDark || isBusy) {
    const backingPad = Math.round(Math.min(drawW, drawH) * 0.25)
    const bx = x - backingPad
    const by = y - backingPad
    const bw = drawW + backingPad * 2
    const bh = drawH + backingPad * 2
    const br = Math.round(Math.min(bw, bh) * 0.12)

    ctx.save()
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.78)'
    // Soft outer shadow on the backing for a gentle lift
    ctx.shadowColor = 'rgba(0,0,0,0.15)'
    ctx.shadowBlur = Math.round(drawW * 0.05)
    ctx.shadowOffsetY = Math.round(drawW * 0.012)
    roundRect(ctx, bx, by, bw, bh, br)
    ctx.fill()
    ctx.restore()
    ctx.drawImage(logoBmp, x, y, drawW, drawH)
  } else {
    // Light & clean area — draw logo with a very subtle drop shadow for lift
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.10)'
    ctx.shadowBlur = Math.round(drawW * 0.03)
    ctx.shadowOffsetY = Math.round(drawW * 0.008)
    ctx.drawImage(logoBmp, x, y, drawW, drawH)
    ctx.restore()
  }

  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
}

/** Convert an SVG or image file to a PNG data URL (for logo) */
export function fileToPngDataUrl(file, maxWidth = 600) {
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
        resolve(cvs.toDataURL('image/png'))
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
