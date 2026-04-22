/**
 * Model routing logic — matches the skill's NB2/NB Pro hybrid routing.
 *
 * NB2 native AR  → NB2 ($0.08), no resize
 * NB Pro native AR (same set minus 4:1/1:4) → NB Pro ($0.15), no resize
 * Other AR → NB Pro ($0.15) + canvas center-crop to target dimensions
 */

const NB2_NATIVE = new Set([
  '21:9', '16:9', '3:2', '4:3', '5:4',
  '1:1', '4:5', '3:4', '2:3', '9:16',
])

const NBP_NATIVE = new Set([
  '21:9', '16:9', '3:2', '4:3', '5:4',
  '1:1', '4:5', '3:4', '2:3', '9:16',
])

/** Find the closest NB Pro native AR for a given width/height */
export function closestNBProAR(w, h) {
  const list = [...NBP_NATIVE]
  const ratio = w / h
  let best = list[0]
  let bestDiff = Infinity
  for (const ar of list) {
    const [a, b] = ar.split(':').map(Number)
    const diff = Math.abs(a / b - ratio)
    if (diff < bestDiff) {
      bestDiff = diff
      best = ar
    }
  }
  return best
}

/**
 * Resolve which model + AR to use for a given format.
 * Returns { type: 'nb2'|'nbpro', ar: string, needsResize: boolean }
 */
export function resolveModel(fmt) {
  if (NB2_NATIVE.has(fmt.ar)) {
    return { type: 'nb2', ar: fmt.ar, needsResize: false }
  }
  if (NBP_NATIVE.has(fmt.ar)) {
    return { type: 'nbpro', ar: fmt.ar, needsResize: false }
  }
  const ar = closestNBProAR(fmt.width, fmt.height)
  return { type: 'nbpro', ar, needsResize: true }
}

/** Cost per image for a given model type */
export function costPerImage(modelType) {
  if (modelType === 'nb2') return 0.08
  if (modelType === 'flux-kontext') return 0.04 // fal-ai/flux-pro/kontext
  return 0.15 // nbpro
}

/** Calculate total estimated cost for a list of formats */
export function estimateCost(formats) {
  return formats.reduce((sum, fmt) => {
    const model = resolveModel(fmt)
    return sum + costPerImage(model.type)
  }, 0)
}
