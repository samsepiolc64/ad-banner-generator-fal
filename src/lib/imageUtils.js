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
 * Composite a user-provided logo onto a generated banner.
 * Logo is placed top-left at ~18% of banner width with padding,
 * preserving original aspect ratio and pixel-perfect fidelity.
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

  const c = document.createElement('canvas')
  c.width = bannerBmp.width
  c.height = bannerBmp.height
  const ctx = c.getContext('2d')
  ctx.drawImage(bannerBmp, 0, 0)

  // Logo sizing: 18% of banner width, preserve aspect ratio
  // Cap the height at 14% of banner height so wide bars (728x90) stay readable
  const logoMaxW = Math.round(bannerBmp.width * 0.18)
  const logoMaxH = Math.round(bannerBmp.height * 0.14)
  const logoRatio = logoBmp.width / logoBmp.height

  let drawW = logoMaxW
  let drawH = Math.round(drawW / logoRatio)
  if (drawH > logoMaxH) {
    drawH = logoMaxH
    drawW = Math.round(drawH * logoRatio)
  }

  // Padding: 3.5% of shorter edge, minimum 8px
  const pad = Math.max(8, Math.round(Math.min(bannerBmp.width, bannerBmp.height) * 0.035))

  ctx.drawImage(logoBmp, pad, pad, drawW, drawH)

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
