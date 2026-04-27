import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasTransparency, removeBackgroundFloodFill, injectXmpDescription } from './imageUtils.js'

// ─── Canvas mock helpers ──────────────────────────────────────────────────────

/**
 * Build a minimal canvas-like object backed by a flat RGBA Uint8ClampedArray.
 * The getContext('2d') mock supports getImageData / putImageData — the only
 * two canvas operations used by hasTransparency and removeBackgroundFloodFill.
 */
function makeCanvas(w, h, rgbaFlat) {
  const data = new Uint8ClampedArray(rgbaFlat)
  const imgData = { data }
  return {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => imgData,
      putImageData: () => {},
    }),
  }
}

/** Fill every pixel with a single RGBA value. */
function solidCanvas(w, h, r, g, b, a = 255) {
  const arr = new Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    arr[i * 4]     = r
    arr[i * 4 + 1] = g
    arr[i * 4 + 2] = b
    arr[i * 4 + 3] = a
  }
  return makeCanvas(w, h, arr)
}

// ─── hasTransparency ──────────────────────────────────────────────────────────

describe('hasTransparency', () => {
  it('returns false for fully-opaque solid canvas', () => {
    const cvs = solidCanvas(4, 4, 255, 255, 255, 255)
    assert.equal(hasTransparency(cvs), false)
  })

  it('returns true when any pixel has alpha < 250', () => {
    const cvs = solidCanvas(4, 4, 255, 255, 255, 255)
    // Poke one transparent pixel at (2,2)
    const idx = (2 * 4 + 2) * 4
    cvs.getContext().getImageData().data[idx + 3] = 0
    assert.equal(hasTransparency(cvs), true)
  })

  it('returns true for fully-transparent canvas', () => {
    const cvs = solidCanvas(4, 4, 0, 0, 0, 0)
    assert.equal(hasTransparency(cvs), true)
  })

  it('returns false when alpha = 250 exactly (boundary — not considered transparent)', () => {
    const cvs = solidCanvas(2, 2, 100, 100, 100, 250)
    assert.equal(hasTransparency(cvs), false)
  })

  it('returns true when alpha = 249 (just below threshold)', () => {
    const cvs = solidCanvas(2, 2, 100, 100, 100, 249)
    assert.equal(hasTransparency(cvs), true)
  })
})

// ─── removeBackgroundFloodFill ────────────────────────────────────────────────

describe('removeBackgroundFloodFill', () => {
  it('returns already-has-alpha when any corner is transparent', () => {
    // Make a 2×2 canvas with TL corner transparent
    const arr = [
      0,   0,   0,   0,   // pixel (0,0) — transparent
      255, 255, 255, 255, // pixel (1,0)
      255, 255, 255, 255, // pixel (0,1)
      255, 255, 255, 255, // pixel (1,1)
    ]
    const cvs = makeCanvas(2, 2, arr)
    const result = removeBackgroundFloodFill(cvs)
    assert.equal(result.removed, false)
    assert.equal(result.reason, 'already-has-alpha')
  })

  it('returns non-uniform-background when corners differ in color', () => {
    // Corners are very different colors — can't determine a uniform bg
    const arr = [
      255, 0,   0,   255, // TL red
      0,   255, 0,   255, // TR green
      0,   0,   255, 255, // BL blue
      255, 255, 0,   255, // BR yellow
    ]
    const cvs = makeCanvas(2, 2, arr)
    const result = removeBackgroundFloodFill(cvs)
    assert.equal(result.removed, false)
    assert.equal(result.reason, 'non-uniform-background')
  })

  it('removes uniform white background', () => {
    // 2×2 all-white canvas — uniform bg → should be removed
    const cvs = solidCanvas(2, 2, 255, 255, 255, 255)
    const result = removeBackgroundFloodFill(cvs)
    assert.equal(result.removed, true)
    assert.equal(result.reason, null)
    assert.deepEqual(result.bgColor, [255, 255, 255])
  })

  it('removes uniform dark background', () => {
    const cvs = solidCanvas(3, 3, 20, 20, 20, 255)
    const result = removeBackgroundFloodFill(cvs)
    assert.equal(result.removed, true)
    assert.deepEqual(result.bgColor, [20, 20, 20])
  })

  it('sets alpha to 0 for matched bg pixels', () => {
    const cvs = solidCanvas(2, 2, 255, 255, 255, 255)
    removeBackgroundFloodFill(cvs)
    // After removal, every pixel should have alpha = 0 (fully transparent bg)
    const data = cvs.getContext().getImageData().data
    for (let i = 3; i < data.length; i += 4) {
      assert.equal(data[i], 0, `pixel at offset ${i} should be transparent`)
    }
  })

  it('does not remove bg when corners are within tolerance but center is very different', () => {
    // 3×3 canvas: white corners, very different center — bg should still be detected as white
    const arr = new Array(3 * 3 * 4).fill(255)
    // Center pixel at (1,1) — index 4 in the pixel array
    const centerIdx = (1 * 3 + 1) * 4
    arr[centerIdx]     = 0   // R
    arr[centerIdx + 1] = 0   // G
    arr[centerIdx + 2] = 200 // B
    arr[centerIdx + 3] = 255 // fully opaque
    const cvs = makeCanvas(3, 3, arr)
    const result = removeBackgroundFloodFill(cvs)
    // Corners are all white → bg detected → removal runs
    assert.equal(result.removed, true)
    // Center pixel (non-bg color) should keep its alpha
    const data = cvs.getContext().getImageData().data
    assert.equal(data[centerIdx + 3], 255, 'non-bg pixel must keep alpha')
  })

  it('returns the canvas object in all cases', () => {
    const cvs = solidCanvas(2, 2, 255, 255, 255, 255)
    const { canvas } = removeBackgroundFloodFill(cvs)
    assert.strictEqual(canvas, cvs)
  })
})

// ─── injectXmpDescription ─────────────────────────────────────────────────────

/** Minimal valid JPEG: SOI + EOI */
function minimalJpeg() {
  return new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])], { type: 'image/jpeg' })
}

/** JPEG with APP0 (JFIF) segment */
function jpegWithApp0() {
  const payload = new Uint8Array([0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])
  const len = 2 + payload.length // length field includes itself
  const bytes = [
    0xFF, 0xD8,                          // SOI
    0xFF, 0xE0,                          // APP0 marker
    (len >> 8) & 0xFF, len & 0xFF,       // APP0 length
    ...payload,                          // JFIF data
    0xFF, 0xD9,                          // EOI
  ]
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}

/** Read a Blob as Uint8Array */
async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer())
}

/** Find the first occurrence of a byte sequence in a Uint8Array */
function findBytes(arr, needle) {
  outer: for (let i = 0; i <= arr.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (arr[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

describe('injectXmpDescription', () => {
  it('returns original blob when input is not a JPEG', async () => {
    const notJpeg = new Blob([new Uint8Array([0x00, 0x01, 0x02])], { type: 'image/jpeg' })
    const result = await injectXmpDescription(notJpeg, 'test')
    assert.strictEqual(result, notJpeg)
  })

  it('injects APP1 marker (FF E1) right after SOI in a minimal JPEG', async () => {
    const result = await injectXmpDescription(minimalJpeg(), 'test description')
    const bytes = await blobBytes(result)
    // SOI still at 0-1
    assert.strictEqual(bytes[0], 0xFF)
    assert.strictEqual(bytes[1], 0xD8)
    // APP1 marker immediately after SOI
    assert.strictEqual(bytes[2], 0xFF)
    assert.strictEqual(bytes[3], 0xE1)
  })

  it('result is larger than the original (XMP segment was inserted)', async () => {
    const orig = minimalJpeg()
    const result = await injectXmpDescription(orig, 'hello')
    assert.ok(result.size > orig.size)
  })

  it('embeds the XMP namespace identifier in the segment', async () => {
    const result = await injectXmpDescription(minimalJpeg(), 'test')
    const bytes = await blobBytes(result)
    const identifier = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/')
    assert.ok(findBytes(bytes, identifier) !== -1, 'XMP identifier not found')
  })

  it('embeds the description text in the XMP payload', async () => {
    const result = await injectXmpDescription(minimalJpeg(), 'Baner filtracji wody')
    const bytes = await blobBytes(result)
    const desc = new TextEncoder().encode('Baner filtracji wody')
    assert.ok(findBytes(bytes, desc) !== -1, 'description text not found in XMP')
  })

  it('escapes XML special characters in description', async () => {
    const result = await injectXmpDescription(minimalJpeg(), 'a & b <c> "d"')
    const bytes = await blobBytes(result)
    const escaped = new TextEncoder().encode('a &amp; b &lt;c&gt; &quot;d&quot;')
    assert.ok(findBytes(bytes, escaped) !== -1, 'escaped entities not found')
  })

  it('inserts APP1 AFTER APP0 when APP0 is present', async () => {
    const result = await injectXmpDescription(jpegWithApp0(), 'desc')
    const bytes = await blobBytes(result)
    // APP0 marker at offset 2
    assert.strictEqual(bytes[2], 0xFF)
    assert.strictEqual(bytes[3], 0xE0)
    // APP1 must come AFTER the APP0 segment, not at offset 2
    const app0Len = (bytes[4] << 8) | bytes[5]
    const app1Offset = 2 + 2 + app0Len
    assert.strictEqual(bytes[app1Offset], 0xFF)
    assert.strictEqual(bytes[app1Offset + 1], 0xE1)
  })

  it('result type is image/jpeg', async () => {
    const result = await injectXmpDescription(minimalJpeg(), 'test')
    assert.strictEqual(result.type, 'image/jpeg')
  })
})
