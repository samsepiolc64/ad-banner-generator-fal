import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasTransparency, removeBackgroundFloodFill } from './imageUtils.js'

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
