import { useState, useRef } from 'react'
import {
  Folder,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Pencil,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Zap,
  Clock,
  Square,
  ShieldCheck,
} from 'lucide-react'
import { resolveModel, costPerImage } from '../lib/modelRouting'
import { cropToAspect, compressToJpeg, compositeLogoOnBanner, injectXmpDescription } from '../lib/imageUtils'
import { addCost } from '../lib/clientCosts'

/** Zamienia string na bezpieczny slug do nazwy pliku (ASCII, bez spacji). */
function toSlug(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip diacritics (é→e etc.)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Buduje nazwę pliku JPEG dla bannera.
 * Format: {domena}_{szerokość}x{wysokość}_{wariant-slug}_v{num}[_edytowany].jpg
 * Przykład: verseo.pl_1200x628_hero-lifestyle_v1.jpg
 */
function makeFilename(domain, fmt, { edit = false } = {}) {
  const safeDomain = (domain || '')
    .replace(/https?:\/\//g, '')
    .replace(/^www\./, '')
    .replace(/[/:?*"<>|\\]/g, '_')
    .replace(/_+$/g, '')
  const size = `${fmt.width}x${fmt.height}`
  const variant = toSlug(fmt.variantName || '')
  const vNum = fmt.variantNum ? `_v${fmt.variantNum}` : ''
  const base = variant ? `${safeDomain}_${size}_${variant}${vNum}` : `${safeDomain}_${size}${vNum}`
  return edit ? `${base}_edytowany.jpg` : `${base}.jpg`
}

async function runPool(fns, limit = 3) {
  let idx = 0
  async function worker() {
    while (idx < fns.length) {
      const i = idx++
      await fns[i]().catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker))
}

// ── Layout-ref utilities ─────────────────────────────────────────────────────

/** Returns the natural AR (w/h) of an image data URL using a browser Image element. */
function getImageAR(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/**
 * Returns the index of the reference image whose aspect ratio is closest to the
 * target format's AR. Falls back to index 0 on error.
 */
async function pickBestRefIndex(images, fmt) {
  if (!images || images.length <= 1) return 0
  const targetAR = fmt.width / fmt.height
  const ars = await Promise.all(images.map(getImageAR))
  let bestIdx = 0, bestDiff = Infinity
  ars.forEach((ar, i) => {
    if (ar == null) return
    const diff = Math.abs(ar - targetAR)
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i }
  })
  return bestIdx
}

/**
 * Parses an AR string like "16:9" or "1:1" into a numeric ratio.
 * Returns null if unparseable.
 */
function parseArString(arStr) {
  if (!arStr) return null
  const m = String(arStr).match(/^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/)
  if (!m) return null
  const ratio = parseFloat(m[1]) / parseFloat(m[2])
  return isFinite(ratio) && ratio > 0 ? ratio : null
}

/**
 * Returns a human-readable AR adaptation instruction when the reference AR
 * and target format AR differ significantly (>10% relative difference).
 *
 * @param {string} refArStr  — AR extracted by Vision, e.g. "16:9"
 * @param {object} fmt       — target format { width, height, ar }
 */
function buildArAdaptationHint(refArStr, fmt) {
  const refRatio = parseArString(refArStr)
  const targetRatio = fmt.width / fmt.height
  if (!refRatio) return null

  const diff = Math.abs(refRatio - targetRatio) / targetRatio
  if (diff < 0.1) return null // ARs are close enough — no adaptation needed

  const targetArLabel = fmt.ar || `${fmt.width}:${fmt.height}`
  const isTargetWider = targetRatio > refRatio
  const isTargetTaller = targetRatio < refRatio

  let hint = `\n🔄 ASPECT RATIO ADAPTATION REQUIRED:\n`
  hint += `Reference banner AR: ${refArStr} | Target format AR: ${targetArLabel}\n`

  if (isTargetWider) {
    hint += `The target canvas is WIDER than the reference. Adapt the layout:\n`
    hint += `  • Extend the composition horizontally — add more breathing room on the sides, or widen the visual zone\n`
    hint += `  • If reference has a vertical stack (image top / text bottom), consider shifting to a horizontal split (image left / text right)\n`
    hint += `  • Keep the same element count and hierarchy — just spread them across the wider canvas\n`
    hint += `  • Text and CTA remain in the same relative position within their zone`
  } else if (isTargetTaller) {
    hint += `The target canvas is TALLER than the reference. Adapt the layout:\n`
    hint += `  • Extend the composition vertically — add more breathing room top/bottom, or taller visual zone\n`
    hint += `  • If reference has a horizontal split (image left / text right), consider shifting to a vertical stack (image top / text bottom)\n`
    hint += `  • Keep the same element count and hierarchy — just restack them for the taller canvas\n`
    hint += `  • Text and CTA remain in the same relative position within their zone`
  }

  return hint
}

/**
 * Builds a structured analysis block to append to the prompt when Claude Vision
 * has analysed the reference banner (layoutref mode from describe-banner.js).
 *
 * @param {object} analysis  — structured JSON from describe-banner layoutref mode
 * @param {object} fmt       — target format { width, height, ar } for AR adaptation hint
 */
function buildLayoutRefAnalysisBlock(analysis, fmt) {
  const lines = ['\n\n📊 REFERENCE BANNER — PRECISION ANALYSIS (AI vision, highest authority):']

  // AR adaptation hint — inject FIRST so the model sees it before structural data
  if (fmt && analysis.ar) {
    const arHint = buildArAdaptationHint(analysis.ar, fmt)
    if (arHint) lines.push(arHint)
  }

  if (analysis.colors?.length) {
    lines.push(`\n🎨 EXACT COLORS — use ONLY these, no others:\n  ${analysis.colors.join('  ')}`)
    if (analysis.background_color) lines.push(`  Background: ${analysis.background_color}`)
  }
  if (analysis.element_count != null) {
    lines.push(`\n🔢 ELEMENT COUNT: ${analysis.element_count} distinct visual elements — reproduce EXACTLY this many, no more, no fewer`)
  }
  if (analysis.zones) {
    const z = analysis.zones
    const parts = []
    if (z.image_pct != null) parts.push(`visual/image: ~${z.image_pct}%`)
    if (z.text_pct != null) parts.push(`text/copy: ~${z.text_pct}%`)
    if (z.decorative_pct != null) parts.push(`decorative: ~${z.decorative_pct}%`)
    if (z.empty_pct != null) parts.push(`breathing room: ~${z.empty_pct}%`)
    if (parts.length) lines.push(`\n📐 ZONE PROPORTIONS (% of canvas): ${parts.join(' | ')}`)
  }
  if (analysis.typography) {
    const t = analysis.typography
    const hParts = []
    if (t.headline_weight) hParts.push(`weight: ${t.headline_weight}`)
    if (t.headline_color) hParts.push(`color: ${t.headline_color}`)
    if (t.headline_size) hParts.push(`size: ${t.headline_size}`)
    if (t.headline_position) hParts.push(`position: ${t.headline_position}`)
    if (hParts.length) lines.push(`\n✍️ HEADLINE STYLE: ${hParts.join(', ')}`)
    if (t.cta_style || t.cta_bg_color) {
      const cParts = []
      if (t.cta_style) cParts.push(t.cta_style)
      if (t.cta_bg_color) cParts.push(`background: ${t.cta_bg_color}`)
      lines.push(`   CTA BUTTON: ${cParts.join(', ')}`)
    }
  }
  if (analysis.layout) {
    const l = analysis.layout
    const parts = []
    if (l.hero_position) parts.push(`hero: ${l.hero_position}`)
    if (l.text_position) parts.push(`text: ${l.text_position}`)
    if (l.cta_position) parts.push(`CTA: ${l.cta_position}`)
    if (parts.length) lines.push(`\n🗂️ LAYOUT: ${parts.join(' | ')}`)
  }
  if (analysis.fixed_elements?.length) {
    lines.push(`\n📌 FIXED TEMPLATE ELEMENTS — replicate ALL:\n${analysis.fixed_elements.map((e) => `  • ${e}`).join('\n')}`)
  }
  return lines.join('\n')
}

// Used when a real logo WILL be composited after generation — reserve a clean corner
const LOGO_BLOCK_WITH_LOGO = `LOGO RULES — CRITICAL, read carefully:

ALLOWED (this is realistic product photography, do it naturally):
- Brand name / logo may appear ON THE PRODUCT ITSELF — on the jar label, bottle, box, packaging, tube, or any container surface that is part of the product mockup. This is expected for commercial product shots.

FORBIDDEN — NOWHERE ELSE in the composition:
- No brand logo, wordmark, or company name as a floating/standalone graphic element in any corner or margin
- No badges, seals, medallions, stickers, or emblems containing the brand name anywhere outside the product surface
- No watermarks, signatures, URL tags, or brand marks overlaid on background or negative space
- No brand name rendered as a large typographic hero / decorative text element
- No duplicate brand marks — if the brand name appears on the product, it must NOT appear again anywhere else in the frame
- No "inspired-by" lookalike logos, stylized monograms, or typography that reads as a brand mark

CLEAN CORNER REQUIREMENT — this is where our real logo will be composited later:
- At least ONE corner (top-left preferred, or top-right) must be naturally uncluttered: filled only with the background color or gradient — no objects, no text, no decorative elements
- Achieve this through natural composition (push hero content away from that corner) — NOT by drawing any shape, box, or frame
- ABSOLUTELY FORBIDDEN in the clean corner: white box, white card, white rectangle, gray box, gray rectangle, rounded rectangle, frosted panel, semi-transparent overlay, glowing area, empty frame, border outline, badge shape, or ANY distinct geometric shape
- The corner must look like a natural part of the background — same texture, same color, indistinguishable from the rest of the background`

// Used when NO logo is provided — no corner reservation needed, still forbid floating logos
const LOGO_BLOCK_NO_LOGO = `LOGO RULES — CRITICAL, read carefully:

ALLOWED (this is realistic product photography, do it naturally):
- Brand name / logo may appear ON THE PRODUCT ITSELF — on the jar label, bottle, box, packaging, tube, or any container surface that is part of the product mockup.

FORBIDDEN everywhere outside the product surface:
- No brand logo, wordmark, or company name as a floating/standalone graphic element anywhere in the composition
- No badges, seals, medallions, stickers, or emblems containing the brand name outside the product
- No watermarks, signatures, URL tags, or brand marks overlaid on background or negative space
- No brand name rendered as a large typographic hero / decorative text element
- No "inspired-by" lookalike logos, stylized monograms, or typography that reads as a brand mark
- Do NOT add any brand identity text element that was not explicitly listed in AD COPY PLACEMENT`

/**
 * Fetch an external image URL via the proxy-image Netlify function and return
 * a base64 data URL. This solves two issues:
 *   1. CORS restrictions that prevent client-side canvas access.
 *   2. Format problems — fal.ai can't decode WebP; we proxy then convert to JPEG.
 * Returns null on error (non-fatal — caller skips the reference).
 */
async function fetchUrlAsDataUrl(url) {
  try {
    const res = await fetch('/.netlify/functions/proxy-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.dataUrl || null
  } catch {
    return null
  }
}

/**
 * Compress a data URL to max 1024px and JPEG q=0.82 before sending to fal.ai.
 * Keeps reference quality good while staying well under Netlify's 6 MB body limit.
 * NOTE: Only handles data URLs — HTTP URLs must be proxied first via fetchUrlAsDataUrl.
 */
async function compressRefImage(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1024
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
        else { width = Math.round((width * MAX) / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      // White background before draw — handles PNG transparency
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    // On error: return null — caller must skip null references.
    // Never return the original data URL: it might be WebP or a malformed format
    // that fal.ai can't decode, which would cause "source image could not be decoded".
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/**
 * Translate a technical error into a short, plain-Polish message for end users.
 * Keeps it to one sentence — no stack traces, no HTTP codes, no English.
 */
function friendlyError(err) {
  const msg = err?.message || String(err)

  // Abort / timeout
  if (err?.name === 'AbortError' || /abort/i.test(msg)) return 'Czas oczekiwania minął. Spróbuj ponownie.'
  if (/timeout|nie odpowiedział/i.test(msg)) return 'Serwer nie odpowiada. Spróbuj za chwilę.'

  // Image decoding — transient fal.ai server error; auto-retry handles it silently (max 2 attempts).
  // This message is shown only if all retries fail.
  if (/source image could not be decoded/i.test(msg)) return 'Błąd serwera fal.ai (nie można zdekodować obrazu). Kliknij Ponów.'
  if (/could not be decoded|decode/i.test(msg)) return 'Nie można zdekodować obrazu. Użyj pliku JPG lub PNG.'

  // Network / HTTP errors
  if (/poll error|submit error/i.test(msg)) return 'Błąd połączenia z serwerem. Spróbuj ponownie.'
  if (/HTTP 5/i.test(msg)) return 'Błąd serwera. Spróbuj za chwilę.'
  if (/HTTP 4/i.test(msg)) return 'Błąd zapytania. Spróbuj ponownie.'

  // Queue / generation failures
  if (/generation failed|FAILED/i.test(msg)) return 'Generowanie nie powiodło się. Spróbuj ponownie.'
  if (/No queue URLs|No image URL|brak odpowiedzi/i.test(msg)) return 'Brak odpowiedzi z serwera AI. Spróbuj ponownie.'

  // Image analysis
  if (/Analiza obrazu nie powiodła się/i.test(msg)) return 'Analiza obrazu nie powiodła się. Spróbuj ponownie.'
  if (/Brak opisu obrazu/i.test(msg)) return 'Nie udało się przeanalizować obrazu. Spróbuj ponownie.'

  // Edit mode — missing originals
  if (/Brak oryginalnego banera/i.test(msg)) return 'Najpierw wygeneruj baner, a potem edytuj teksty.'
  if (/Brak oryginalnego promptu/i.test(msg)) return 'Najpierw wygeneruj baner, a potem edytuj teksty.'

  // API key missing
  if (/not configured|api.?key/i.test(msg)) return 'Brak klucza API. Skontaktuj się z administratorem.'

  // Fallback — return original but without technical prefixes
  return msg
    .replace(/^(Poll|Submit|Fetch) error:\s*/i, '')
    .replace(/HTTP \d+[^.]*\.?/g, '')
    .trim() || 'Nieznany błąd. Spróbuj ponownie.'
}

/** Extract the first http(s) URL from a string, or null */
function extractUrl(text) {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s,;)]+/)
  return m ? m[0] : null
}

/** True only for direct image URLs (jpg/png/webp/gif/avif) — webpage URLs must NOT go to fal.ai */
function isImageUrl(url) {
  if (!url) return false
  return /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?.*)?$/i.test(url.split('?')[0])
}

/**
 * Extract headline (primary + optional secondary) and CTA from a stored prompt string.
 * Handles both promptBuilder.js and gptImage2PromptBuilder.js output formats.
 *
 * Returns: { headline: string|null, cta: string|null }
 *   headline may contain \n when two-part hierarchy is detected.
 */
function extractTextsFromPrompt(prompt) {
  if (!prompt) return { headline: null, cta: null }

  let primary = null
  let secondary = null
  let cta = null

  // ── Primary headline ────────────────────────────────────────────────────────
  // promptBuilder two-part:    - PRIMARY HEADLINE: "…"
  // gptImage2 two-part:        - PRIMARY HEADLINE (…): "…"
  const mPrimary = prompt.match(/- PRIMARY HEADLINE[^:]*:\s*"([^"]+)"/)
  if (mPrimary) {
    primary = mPrimary[1]
  } else {
    // promptBuilder single-line: - Headline: "…" — position…
    // gptImage2 single-line:     - HEADLINE (…): "…"
    const mHeadline = prompt.match(/- (?:Headline|HEADLINE)[^:]*:\s*"([^"]+)"/)
    if (mHeadline) primary = mHeadline[1]
  }

  // ── Secondary line (only present when two-part hierarchy) ───────────────────
  // promptBuilder:  - SECONDARY LINE: "…"
  // gptImage2:      - SECONDARY LINE directly below…: "…"
  const mSecondary = prompt.match(/- SECONDARY LINE[^:]*:\s*"([^"]+)"/)
  if (mSecondary) secondary = mSecondary[1]

  // ── CTA ─────────────────────────────────────────────────────────────────────
  // promptBuilder:  - CTA button: "…" —
  // gptImage2:      - CTA BUTTON with text "…"
  const mCta = prompt.match(/- CTA (?:button|BUTTON with text)\s*[:"]\s*"?([^"\n—]+)"?/)
  if (mCta) cta = mCta[1].trim().replace(/^"|"$/, '')

  if (!primary) return { headline: null, cta: cta || null }

  const headline = secondary ? `${primary}\n${secondary}` : primary
  return { headline, cta: cta || null }
}

/**
 * Replace ad copy texts (headline + CTA) in an already-built prompt string.
 * Targets the fixed patterns emitted by promptBuilder.js — single-line or two-part hierarchy.
 */
function replaceAdCopyInPrompt(prompt, headline, cta) {
  const parts = headline.split('\n').map((s) => s.trim()).filter(Boolean)
  const primary = parts[0] || ''
  const secondary = parts[1] || null

  let result = prompt
  if (secondary) {
    result = result.replace(/- PRIMARY HEADLINE: "[^"]*"/, `- PRIMARY HEADLINE: "${primary}"`)
    result = result.replace(/- SECONDARY LINE: "[^"]*"/, `- SECONDARY LINE: "${secondary}"`)
  } else {
    result = result.replace(/- Headline: "[^"]*"/, `- Headline: "${primary}"`)
  }
  result = result.replace(/- CTA button: "[^"]*"/, `- CTA button: "${cta}"`)
  return result
}

/**
 * Replace ad copy texts in a GPT Image 2 prompt string.
 * Targets the patterns emitted by gptImage2PromptBuilder.js.
 */
function replaceAdCopyInGptPrompt(prompt, headline, cta) {
  const parts = headline.split('\n').map((s) => s.trim()).filter(Boolean)
  const primary = parts[0] || ''
  const secondary = parts[1] || null

  let result = prompt
  if (secondary) {
    // Two-line: PRIMARY HEADLINE (...): "text" + SECONDARY LINE ...: "text"
    result = result.replace(/- PRIMARY HEADLINE \([^)]*\): "[^"]*"/, `- PRIMARY HEADLINE (largest, heaviest, dominant): "${primary}"`)
    result = result.replace(/- SECONDARY LINE [^:]*: "[^"]*"/, `- SECONDARY LINE directly below: "${secondary}"`)
  } else if (/- PRIMARY HEADLINE/.test(result)) {
    // Was two-line originally — keep structure, clear secondary
    result = result.replace(/- PRIMARY HEADLINE \([^)]*\): "[^"]*"/, `- PRIMARY HEADLINE (largest, heaviest, dominant): "${primary}"`)
    result = result.replace(/- SECONDARY LINE [^:]*: "[^"]*"/, '')
  } else {
    // Single line: HEADLINE (...): "text"
    result = result.replace(/- HEADLINE \([^)]*\): "[^"]*"/, `- HEADLINE (large, bold): "${primary}"`)
  }
  // CTA: - CTA BUTTON with text "..." — rest of line unchanged
  result = result.replace(/- CTA BUTTON with text "[^"]*"/, `- CTA BUTTON with text "${cta}"`)
  return result
}

/**
 * Build an NB Pro /edit prompt from a structured JSON description of the
 * original banner (produced by Claude Vision via describe-banner.js) PLUS
 * the new text values the user wants. The JSON carries every visual attribute
 * of the original — scene, subjects, lighting, composition, typography style,
 * text positions — while the text CONTENT is injected fresh.
 *
 * Why: NB Pro reliably renders Polish diacritics (KAWĄ, ŚWIEŻĄ, Sprawdź) but
 * needs a thorough prompt to reproduce the original layout closely. The
 * original image is also passed as a reference (image_urls) to anchor visual
 * identity — the JSON + image reference together give ~75-85% fidelity.
 */
function buildTextEditPromptFromJson(description, headline, cta, isStories, isTikTokVertical) {
  const parts = headline.split('\n').map((s) => s.trim()).filter(Boolean)
  const primary = parts[0] || ''
  const secondary = parts[1] || null
  const includeCta = !isStories && !isTikTokVertical

  const textBlock = secondary
    ? `- PRIMARY HEADLINE: "${primary}" (large, dominant)\n- SECONDARY LINE: "${secondary}" (smaller, below primary)`
    : `- Headline: "${primary}"`
  const ctaBlock = includeCta ? `\n- CTA button: "${cta}"` : ''

  // Pretty-printed JSON to keep it readable in the prompt
  const jsonPretty = JSON.stringify(description, null, 2)

  return `Recreate this advertising banner exactly as described in the JSON specification below. The first reference image is the ORIGINAL banner — reproduce its visual identity (scene, subjects, lighting, composition, colors, mood) as faithfully as possible. ONLY the text content changes.

VISUAL SPECIFICATION (from analysis of the original):
${jsonPretty}

AD COPY — use EXACTLY these text values, rendered in the typography style described in "text_layout":
${textBlock}${ctaBlock}

CRITICAL REQUIREMENTS:
- Reproduce the scene, background, subjects, foreground objects, composition, lighting, color palette, atmosphere, and photographic style EXACTLY as described in the JSON. Use the reference image as the authoritative source for visual identity.
- Place the new text content at the positions described in "text_layout" using the typography styles described there (font character, size, color, weight, casing).
- Render all text with crisp, correctly-spelled Polish typography — including Polish diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń) spelled and shaped correctly.
- Preserve the aspect ratio and logo placement from the JSON.
- Do NOT add, remove, or rearrange any visual elements beyond what is described.
- Do NOT change the people's appearance, poses, clothing, or expressions — reproduce them from the reference image.

NEGATIVE PROMPT: garbled text, misspelled words, missing diacritics, wrong characters, different people, different composition, added elements, removed elements, different color palette.`
}

/** Convert a Blob to a base64 data URL (needed to re-send as image reference) */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const SESSION_FOLDER = (() => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
})()

async function uploadToDrive(blob, filename, sessionFolderId, mimeType = 'image/jpeg') {
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(blob)
  })
  await fetch('/.netlify/functions/upload-to-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, imageBase64: base64, sessionFolderId, mimeType }),
  })
}

export default function GeneratorPanel({ formats, logoDataUrl, brandName, domain, notes, productImages = [], notesImageUrl, styleReferenceImages = [], moodImages = [], falMode = 'test', imageModel = 'nanobanan' }) {
  const [statuses, setStatuses] = useState(() => {
    const s = {}
    formats.forEach((f) => (s[f.id] = { status: 'idle' }))
    return s
  })
  const [previews, setPreviews] = useState({})
  const [doneCount, setDoneCount] = useState(0)
  const [running, setRunning] = useState(false)
  const folderHandleRef = useRef(null)
  const [folderName, setFolderName] = useState(null)
  const abortRef = useRef(null)
  // Pre-flight Drive folder IDs — created once before parallel uploads start
  const driveFolderRef = useRef(null)
  // Collects { filename → finalPrompt } for each successfully generated banner
  const promptsMapRef = useRef({})
  // Collects { filename → { headline, cta } } for text-edit feature
  const textsMapRef = useRef({})
  // Collects { filename → seed } returned by fal.ai — used for text-edit regeneration
  const seedMapRef = useRef({})
  // Collects { filename → Blob } — original compressed banner, used as img2img reference
  const originalBlobsRef = useRef({})
  // Cache of { filename → description JSON } returned by Claude Vision (describe-banner).
  // Prevents re-running Vision on every text edit of the same banner — one description
  // per banner, reused across multiple text-edit regenerations.
  const descriptionsMapRef = useRef({})
  // Cache of { refImageIndex → analysis } for layout-ref Vision pre-analysis.
  // Pre-computed ONCE in generateAll before the pool starts — shared across all
  // layout-ref variants so each reference image is analyzed only once, not N times
  // in parallel (which caused timeouts and silent fallbacks to weaker prompts).
  const layoutRefAnalysisCacheRef = useRef({})
  // Tracks which banner rows have their prompt expanded (filename → bool)
  const [expandedPrompts, setExpandedPrompts] = useState({})
  // Tracks which banner rows have their text editor open (filename → bool)
  const [expandedTexts, setExpandedTexts] = useState({})
  // Current form values in text editors (filename → { primary, secondary, cta })
  const [editingTexts, setEditingTexts] = useState({})
  // AI captions (fmt.id → string) — generated fire-and-forget after each banner completes
  const [captions, setCaptions] = useState({})
  // Banner quality evaluations (fmt.id → { verdict, score, channel_label, flags })
  const [evaluations, setEvaluations] = useState({})
  // Set of fmt.ids currently being evaluated
  const [evaluatingIds, setEvaluatingIds] = useState(new Set())
  // Expanded state for evaluation flag panels (fmt.id → bool)
  const [expandedEvals, setExpandedEvals] = useState({})

  const fsaOk = typeof window !== 'undefined' && 'showDirectoryPicker' in window

  const totalFormats = formats.length
  const progress = totalFormats > 0 ? Math.round((doneCount / totalFormats) * 100) : 0

  const pickFolder = async () => {
    if (!fsaOk) {
      setFolderName('Downloads')
      return
    }
    try {
      folderHandleRef.current = await window.showDirectoryPicker({ mode: 'readwrite' })
      setFolderName(folderHandleRef.current.name)
    } catch {}
  }

  const updateStatus = (id, data) => {
    setStatuses((prev) => ({ ...prev, [id]: data }))
  }

  const pollForResult = async (statusUrl, responseUrl, signal) => {
    const POLL_INTERVAL = 3000
    const MAX_POLLS = 60 // 3s × 60 = 3 minutes max

    for (let i = 0; i < MAX_POLLS; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const res = await fetch('/.netlify/functions/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_url: statusUrl, response_url: responseUrl, falMode }),
        signal,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Poll error: HTTP ${res.status}: ${errText.slice(0, 200)}`)
      }

      const data = await res.json()

      if (data.error) throw new Error(data.error)
      if (data.status === 'COMPLETED') return { imageUrl: data.imageUrl, seed: data.seed ?? null }
      if (data.status === 'FAILED') throw new Error('fal.ai: generation failed')

      await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    }

    throw new Error('Timeout — fal.ai nie odpowiedział w 3 minuty')
  }

  // textOverrides = { headline, cta } — when provided, replaces copy in the prompt
  // _retryCount — internal, do not pass from outside
  const generateOne = async (fmt, signal, textOverrides = null, _retryCount = 0) => {
    updateStatus(fmt.id, { status: 'generating' })

    const isGptImage2 = imageModel === 'gpt-image-2'
    const model = resolveModel(fmt)
    const hasLogo = !!logoDataUrl
    // productImages[] (base64) > notesImageUrl (confirmed image URL from App.jsx probe) > fallback extension check
    // Webpage URLs must never reach fal.ai as image_urls (causes 502).
    const rawNotesUrl = productImages.length === 0 && !notesImageUrl ? extractUrl(notes) : null
    const productRefUrl = productImages.length > 0 ? null
      : notesImageUrl ? notesImageUrl
      : (rawNotesUrl && isImageUrl(rawNotesUrl)) ? rawNotesUrl
      : null
    const hasProductRef = productImages.length > 0 || !!productRefUrl
    const hasRef = hasLogo || hasProductRef

    // Pick the right logo block based on whether a real logo will be composited
    const logoBlock = hasLogo ? LOGO_BLOCK_WITH_LOGO : LOGO_BLOCK_NO_LOGO

    // Always suppress fal.ai from rendering the brand name as floating text.
    const brandNameSuppress = `\n\n⚠️ BRAND NAME TEXT — ABSOLUTE PROHIBITION: do NOT render "${brandName}" or any variation of this name as visible text ANYWHERE in this image outside of product labels/packaging. No brand wordmark as a floating element. No brand name as headline, subtitle, caption, or decorative element. No brand signature in any corner. Communicate brand identity ONLY through visual style: colors, photography, and motifs — NEVER through rendering the brand name as standalone text.`

    // Style reference instruction — injected when existing client banners are supplied.
    const styleRefCount = styleReferenceImages?.length || 0
    const isLayoutRefVariant = fmt.variantName === 'Ze wzoru referencyjnego'

    // ── Layout-ref: AR matching + Claude Vision pre-analysis ─────────────────
    // For layout-ref variants: pick the reference image whose AR most closely
    // matches the target format, then run the 'layoutref' vision mode to extract
    // precise structural data (colors, element count, zones, typography, layout).
    // Both outputs are injected into the final prompt before sending to fal.ai.
    // Non-fatal — generation proceeds even if this step fails.
    let layoutRefBestIdx = 0
    let layoutRefAnalysisInjection = ''
    if (isLayoutRefVariant && styleReferenceImages?.length > 0) {
      layoutRefBestIdx = await pickBestRefIndex(styleReferenceImages, fmt)
      // Primary path: read from pre-computed cache (populated in generateAll before the pool).
      // This guarantees each reference image is analyzed only once — no concurrent API calls.
      const cachedAnalysis = layoutRefAnalysisCacheRef.current[layoutRefBestIdx]
      if (cachedAnalysis) {
        layoutRefAnalysisInjection = buildLayoutRefAnalysisBlock(cachedAnalysis, fmt)
      } else {
        // Fallback: cache miss (e.g. retry of a single banner, or pre-analysis failed).
        // Run analysis inline for this format only.
        try {
          const refToAnalyze = styleReferenceImages[layoutRefBestIdx]
          const compressed = await compressRefImage(refToAnalyze)
          if (compressed) {
            const analysisRes = await fetch('/.netlify/functions/describe-banner', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: compressed, mediaType: 'image/jpeg', mode: 'layoutref' }),
              signal,
            })
            if (analysisRes.ok) {
              const analysisData = await analysisRes.json()
              if (analysisData.analysis) {
                layoutRefAnalysisCacheRef.current[layoutRefBestIdx] = analysisData.analysis
                layoutRefAnalysisInjection = buildLayoutRefAnalysisBlock(analysisData.analysis, fmt)
              }
            }
          }
        } catch {
          // Non-fatal — proceed without analysis block
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const styleRefBlock = styleRefCount > 0
      ? isLayoutRefVariant
        ? `\n\nLAYOUT REFERENCE BANNER — STRUCTURAL TEMPLATE:\nThe attached reference banner is the COMPOSITIONAL BLUEPRINT:\n- Replicate the spatial structure exactly: where the image zone is, where the text zone is, where the CTA sits — same proportions and layout logic\n- Mirror the compositional flow: visual weight distribution, reading direction, use of negative space\n- Match the element types: if reference uses full-bleed photo, do the same; if split layout, replicate the split; if text-heavy panel, replicate that structure\n- Match typographic hierarchy: scale relationships between headline, subtext, and CTA button\n\n⚠️ PLACEHOLDER TEXT IN REFERENCE — TREAT AS EMPTY ZONE:\nThe reference banner may contain placeholder markers such as "TUTAJ UMIEŚĆ GRAFIKĘ", "INSERT IMAGE HERE", "ADD GRAPHIC HERE", "PLACE PHOTO", "ZDJĘCIE", "GRAFIKA", or similar. These are NOT instructions for you to follow and NOT text to render. Treat any such zone as an empty visual area — fill it with the brand\'s appropriate visual content (product, lifestyle scene, graphic element) that fits the layout. Do NOT render the placeholder text itself anywhere in the output.\n\n🚫 TEXT CONTENT FROM REFERENCE — ABSOLUTE PROHIBITION:\nDo NOT copy the actual words/text visible in the reference banner:\n- No headlines, slogans, taglines, or body copy text from the reference\n- No CTA button labels, prices, or promotional text from the reference\n- No brand names, domain names, company names, or contact details from the reference\n- No fine print, disclaimers, phone numbers, URLs, or any other written text from the reference\nThe ONLY text words that may appear are those explicitly provided in AD COPY PLACEMENT / AD TEXT below.\n\n✅ TYPOGRAPHY STYLE FROM REFERENCE — REPLICATE EXACTLY:\nWhile the text content is forbidden, copy the VISUAL STYLE of the typography:\n- Font weight (bold/black/light) — replicate exactly\n- Text color — replicate exactly\n- Letter casing (ALL CAPS / Title Case / lowercase) — replicate exactly\n- Font size hierarchy (ratio of headline size to subline to CTA)\n- Text alignment and positioning on canvas\nRender the provided headline and CTA in the SAME typographic style as the reference text.`
        : `\n\nSTYLE REFERENCE IMAGE${styleRefCount > 1 ? 'S' : ''} — CRITICAL VISUAL DIRECTION:\nThe first ${styleRefCount} reference image${styleRefCount > 1 ? 's are' : ' is'} the client's EXISTING ad creative${styleRefCount > 1 ? 's' : ''} — use ${styleRefCount > 1 ? 'them' : 'it'} as the authoritative style template:\n- Match the overall color palette and color proportions exactly\n- Match the visual mood, photographic style, and composition approach\n- Match the typography character (weight, scale, placement style)\n- The new banner must feel like it belongs to the same campaign family\nDo NOT copy layout or text — only extract the visual DNA (colors, mood, aesthetic treatment).`
      : ''

    // Product reference instruction — injected when a reference image is supplied.
    // Order in submitImageUrls: style refs → products → mood → logo
    const productStartImg = styleRefCount + 1  // 1-based index of first product in image_urls
    const productImgCount = productImages.length + (productRefUrl ? 1 : 0) // total product refs
    const productEndImg = styleRefCount + productImgCount
    let productRefBlock = ''
    if (hasProductRef) {
      if (productImgCount > 1) {
        productRefBlock = `\n\nPRODUCT REFERENCE IMAGES (images #${productStartImg}–#${productEndImg}) — ALL ${productImgCount} PRODUCTS MUST APPEAR IN THE BANNER:\nThese ${productImgCount} reference images show ALL the products that MUST be featured. This is NON-NEGOTIABLE:\n- ⚡ ALL ${productImgCount} products from these reference images must appear together in the banner — not just one, not just the most prominent\n- Reproduce each product's EXACT shape, silhouette, proportions, colors, materials, and surface finish\n- Reproduce EVERY packaging detail for each product: label text, graphic elements, logo, color blocks\n- Arrange all ${productImgCount} products in the composition so each is clearly visible and individually recognizable\n- A viewer who knows all these products must confirm "yes, every product is correctly shown"\nDO NOT show only one product and ignore the others. All products must be present and clearly visible. Featuring fewer than all ${productImgCount} products = creative failure.`
      } else {
        productRefBlock = `\n\nPRODUCT REFERENCE IMAGE — ABSOLUTE FIDELITY REQUIRED:\nReference image #${productStartImg} shows the EXACT product to feature. This is NON-NEGOTIABLE:\n- Reproduce the product's EXACT shape, silhouette, and proportions — no simplification\n- Reproduce the EXACT colors, materials, surface textures, and finish\n- Reproduce EVERY detail of the packaging: label text, graphic elements, logo on packaging, color blocks, any printed design\n- Reproduce the EXACT size relationships between all parts of the product\n- Whether the product appears as a standalone object, worn by a model, held in hand, or integrated into a scene — it MUST be recognizable as THIS specific product from THIS reference image\n- A viewer who knows the real product must immediately confirm "yes, that's the correct product"\nDO NOT redesign, stylize, simplify, or reinterpret. Unfaithful product reproduction = failed creative.`
      }
    }

    // Mood / atmosphere reference instruction
    const moodRefCount = moodImages?.length || 0
    const moodRefBlock = moodRefCount > 0
      ? `\n\nMOOD / ATMOSPHERE REFERENCE IMAGE${moodRefCount > 1 ? 'S' : ''} — STYLE INSPIRATION:\nThe ${moodRefCount > 1 ? 'next ' + moodRefCount + ' reference images are' : 'next reference image is'} provided as atmospheric/style inspiration:\n- Match the lighting character, color temperature, and overall mood\n- Match the level of warmth, softness vs. drama in the scene\n- These show the aesthetic direction the client wants — absorb the feeling\nDo NOT copy specific objects or layouts — only extract atmosphere, light, and color feeling.`
      : ''

    // --- TEXT-EDIT MODE (img2img): send original banner as reference + focused prompt ---
    // Used when textOverrides provided — preserves visual composition, swaps text only.
    // Not available for GPT Image 2 (NB Pro /edit feature only).
    const isEditMode = !isGptImage2 && !!textOverrides
    const isStories = fmt.channel === 'meta' && (fmt.ar === '9:16' || (fmt.height > fmt.width && fmt.height / fmt.width > 1.5))
    const isTikTokVertical = fmt.channel === 'tiktok'

    let finalPrompt
    let submitImageUrls

    if (isEditMode) {
      // JSON re-describe path: Claude Vision analyzes the ORIGINAL banner → detailed
      // JSON → we substitute new text content → NB Pro /edit regenerates from scratch
      // with the original as a visual reference image. NB Pro renders Polish
      // diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń) correctly.
      const origFilename = makeFilename(domain, fmt)
      const origBlob = originalBlobsRef.current[origFilename]
      if (!origBlob) throw new Error('Brak oryginalnego banera do edycji — zregeneruj go najpierw.')
      const origDataUrl = await blobToDataUrl(origBlob)

      // Describe once, cache for subsequent edits of the same banner
      let description = descriptionsMapRef.current[origFilename]
      if (!description) {
        const descRes = await fetch('/.netlify/functions/describe-banner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: origDataUrl, mediaType: 'image/jpeg' }),
          signal,
        })
        if (!descRes.ok) {
          const errText = await descRes.text().catch(() => '')
          throw new Error(`Analiza obrazu nie powiodła się: ${errText.slice(0, 200)}`)
        }
        const descData = await descRes.json()
        if (!descData.description) throw new Error('Brak opisu obrazu z Claude Vision')
        description = descData.description
        descriptionsMapRef.current[origFilename] = description
      }

      finalPrompt = buildTextEditPromptFromJson(
        description, textOverrides.headline, textOverrides.cta, isStories, isTikTokVertical
      )
      submitImageUrls = [origDataUrl]
    } else if (isGptImage2 && textOverrides) {
      // GPT Image 2 text update: replace text values in the stored original prompt, then regenerate t2i.
      // No img2img reference — composition may vary slightly vs. original.
      const origKey = makeFilename(domain, fmt)
      const storedPrompt = promptsMapRef.current[origKey]
      if (!storedPrompt) throw new Error('Brak oryginalnego promptu — zregeneruj baner najpierw.')
      finalPrompt = replaceAdCopyInGptPrompt(storedPrompt, textOverrides.headline, textOverrides.cta)
      submitImageUrls = []
    } else if (isGptImage2) {
      // GPT Image 2: text-to-image only — no image_urls sent to fal.ai.
      // Instead, describe materials (product/banner/mood) via Claude Vision and
      // append those descriptions as text blocks so GPT Image 2 can use them.
      finalPrompt = fmt.prompt
      submitImageUrls = []

      const materialItems = [
        ...(styleReferenceImages?.map((u) => ({ dataUrl: u, category: 'banner' })) || []),
        ...(productImages?.map((u) => ({ dataUrl: u, category: 'product' })) || []),
        ...(moodImages?.map((u) => ({ dataUrl: u, category: 'mood' })) || []),
      ]

      if (materialItems.length > 0) {
        try {
          // Compress images before sending to describe-materials
          const compressedItems = await Promise.all(
            materialItems.map(async (item) => ({
              ...item,
              dataUrl: await compressRefImage(item.dataUrl),
            }))
          )
          const descRes = await fetch('/.netlify/functions/describe-materials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: compressedItems }),
            signal,
          })
          if (descRes.ok) {
            const descData = await descRes.json()
            const descriptions = descData.descriptions || []

            // Format descriptions as prompt appendix blocks
            const productDescs = descriptions.filter((d) => d.category === 'product')
            const bannerDescs = descriptions.filter((d) => d.category === 'banner')
            const moodDescs = descriptions.filter((d) => d.category === 'mood')

            let appendix = ''
            if (productDescs.length === 1) {
              appendix += `\n\nPRODUCT REFERENCE — REPRODUCE WITH EXACT FIDELITY:\n${productDescs[0].text}\nThis specific product must appear in the ad, reproduced as faithfully as possible — correct shape, colors, materials, packaging. Whether shown standalone, worn by a model, or integrated into a scene, it must be immediately recognizable as this product.`
            } else if (productDescs.length > 1) {
              const allProductsText = productDescs.map((d, i) => `Product ${i + 1}: ${d.text}`).join('\n')
              appendix += `\n\nPRODUCT REFERENCES — ALL ${productDescs.length} PRODUCTS MUST APPEAR IN THE BANNER:\n${allProductsText}\n\n⚡ NON-NEGOTIABLE: ALL ${productDescs.length} products described above must be clearly visible and individually recognizable in the banner. Do NOT feature only one and ignore the others. Arrange all products together in the composition so each can be identified. Reproduce each product's exact shape, colors, materials, and packaging details as described. Featuring fewer than all ${productDescs.length} products = creative failure.`
            }
            if (bannerDescs.length > 0) {
              const styleBlock = bannerDescs.map((d, i) =>
                bannerDescs.length > 1 ? `Reference ${i + 1}: ${d.text}` : d.text
              ).join('\n')
              if (isLayoutRefVariant) {
                appendix += `\n\nLAYOUT REFERENCE — STRUCTURAL BLUEPRINT:\n${styleBlock}\nReplicate the compositional structure of this reference: spatial zones, layout logic, reading order, element proportions, typographic hierarchy. Do NOT copy colors, logos, text, or brand identity — replace everything with this brand's identity.`
              } else {
                appendix += `\n\nSTYLE REFERENCE — EXISTING AD CREATIVE:\n${styleBlock}\nMatch this visual style DNA: same color palette approach, same mood, same compositional feeling. Do NOT copy layout or text — only extract the visual aesthetic.`
              }
            }
            if (moodDescs.length > 0) {
              const atmBlock = moodDescs.map((d) => d.text).join(' ')
              appendix += `\n\nATMOSPHERE REFERENCE:\n${atmBlock}\nUse this as inspiration for lighting, color temperature, and emotional tone — do not copy the scene literally.`
            }
            if (appendix) finalPrompt = finalPrompt + appendix
          }
        } catch {
          // Non-fatal — proceed without descriptions
        }
      }
      // Inject layout-ref precision analysis (after describe-materials appendix)
      if (layoutRefAnalysisInjection) finalPrompt += layoutRefAnalysisInjection
    } else {
      // Normal generation: full prompt + product/logo references
      const basePrompt = fmt.prompt
      finalPrompt = (basePrompt + styleRefBlock + productRefBlock + moodRefBlock)
        .replace('{{LOGO_BLOCK}}', logoBlock)
        .replace('{{BRAND_NAME_SUPPRESS}}', brandNameSuppress)
      // Inject layout-ref precision analysis block
      if (layoutRefAnalysisInjection) finalPrompt += layoutRefAnalysisInjection
      submitImageUrls = []
      // Compress all data URL references before adding — Netlify body limit is 6 MB.
      // HTTPS URLs go through as-is (fal.ai fetches them server-side).
      // ORDER: style refs (visual tone) → product (fidelity) → mood (atmosphere) → logo (composited locally)
      // compressRefImage returns null when it can't decode the image — filter those out
      // to prevent fal.ai from receiving unsupported formats (e.g. WebP).
      if (styleReferenceImages?.length) {
        if (isLayoutRefVariant) {
          // For layout-ref: use ONLY the best AR-matched reference image.
          // Sending multiple refs confuses the model — one precise ref is better.
          const c = await compressRefImage(styleReferenceImages[layoutRefBestIdx])
          if (c) submitImageUrls.push(c)
        } else {
          const compressed = await Promise.all(styleReferenceImages.map(compressRefImage))
          submitImageUrls.push(...compressed.filter(Boolean))
        }
      }
      if (productImages.length > 0) {
        const compressed = await Promise.all(productImages.map(compressRefImage))
        submitImageUrls.push(...compressed.filter(Boolean))
      } else if (productRefUrl) {
        // Proxy HTTP URL through Netlify to avoid CORS and format issues (e.g. WebP CDN URLs).
        // compressRefImage then converts whatever format to JPEG before sending to fal.ai.
        const proxied = await fetchUrlAsDataUrl(productRefUrl)
        if (proxied) {
          const c = await compressRefImage(proxied)
          if (c) submitImageUrls.push(c)
        }
      }
      if (moodImages?.length) {
        const compressed = await Promise.all(moodImages.map(compressRefImage))
        submitImageUrls.push(...compressed.filter(Boolean))
      }
      if (hasLogo) {
        const c = await compressRefImage(logoDataUrl)
        if (c) submitImageUrls.push(c)
      }
    }

    // Reuse the original seed for text-edit regeneration (improves visual similarity)
    const filenameForSeed = makeFilename(domain, fmt)
    const reusedseed = isEditMode ? (seedMapRef.current[filenameForSeed] ?? null) : null

    try {
      // Step 1: Submit to fal.ai queue
      const submitRes = await fetch('/.netlify/functions/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isGptImage2
          ? {
              // GPT Image 2: width+height instead of ar, no reference images, no seed
              prompt: finalPrompt,
              width: fmt.width,
              height: fmt.height,
              modelType: 'gpt-image-2',
              falMode,
            }
          : {
              // Nano Banana 2 / Pro
              prompt: finalPrompt,
              ar: model.ar,
              modelType: isEditMode ? 'nbpro' : model.type,
              useLogo: submitImageUrls.length > 0,
              logoDataUrl: submitImageUrls.length > 0 ? submitImageUrls : undefined,
              falMode,
              ...(reusedseed != null ? { seed: reusedseed } : {}),
            }),
        signal,
      })

      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => '')
        throw new Error(`Submit error: HTTP ${submitRes.status}: ${errText.slice(0, 200)}`)
      }

      const submitData = await submitRes.json()
      if (!submitData.status_url || !submitData.response_url) {
        throw new Error('No queue URLs from fal.ai — got: ' + JSON.stringify(submitData).slice(0, 200))
      }

      // Step 2: Poll for result (every 3s until done)
      const { imageUrl: imgUrl, seed: returnedSeed } = await pollForResult(
        submitData.status_url,
        submitData.response_url,
        signal
      )

      // Step 3: Fetch, resize, composite logo (pixel-perfect), compress, save
      let srcBlob = await (await fetch(imgUrl)).blob()

      // GPT Image 2 generates exact pixel dimensions — no crop needed.
      // Nano Banana Pro may need center-crop for non-native AR formats.
      if (!isGptImage2 && model.needsResize) {
        srcBlob = await cropToAspect(srcBlob, fmt.width, fmt.height)
      }

      // In edit mode the original banner (passed as reference) already has the logo
      // baked in, and NB Pro /edit reproduces it. Re-running compositeLogoOnBanner
      // here would stamp a SECOND logo on top.
      let noLogoBlob = null
      if (hasLogo && !isEditMode) {
        noLogoBlob = await compressToJpeg(srcBlob)
        srcBlob = await compositeLogoOnBanner(srcBlob, logoDataUrl, fmt.width, fmt.height)
      }

      let blob = await compressToJpeg(srcBlob)
      // Edit mode cost = NB Pro $0.15 + Haiku Vision ~$0.003 (only on first edit; subsequent
      // edits of the same banner reuse the cached description).
      const effectiveModelType = isGptImage2 ? 'gpt-image-2' : (isEditMode ? 'nbpro' : model.type)
      addCost(domain, costPerImage(effectiveModelType))

      // Original (unedited) filename — always used as the KEY for our maps so
      // the edit workflow always references the ORIGINAL banner, not a chain
      // of accumulating edits (which would compound text degradation).
      const originalKey = makeFilename(domain, fmt)
      // Actual filename saved to disk. Edited versions get "_edytowany" suffix
      // (and overwrite previous edits on repeated text changes).
      const filename = isEditMode ? makeFilename(domain, fmt, { edit: true }) : originalKey

      // Show preview immediately — do NOT wait for caption
      const previewUrl = URL.createObjectURL(blob)
      setPreviews((prev) => ({ ...prev, [fmt.id]: previewUrl }))

      // Save prompt and texts under the KEY that matches the UI row (always originalKey).
      promptsMapRef.current[originalKey] = finalPrompt
      textsMapRef.current[originalKey] = {
        headline: textOverrides?.headline ?? (fmt.headline || ''),
        cta: textOverrides?.cta ?? (fmt.cta || ''),
      }
      // Seed: saved only on the initial generation — reused for all subsequent edits.
      if (!isEditMode && returnedSeed != null) {
        seedMapRef.current[originalKey] = returnedSeed
      }
      // originalBlobsRef: store the ORIGINAL banner only once (first successful gen).
      // On edit runs we do NOT overwrite it — NB Pro /edit must always reference the
      // pristine original (and Vision's cached description is derived from it too),
      // otherwise repeated edits would accumulate visual drift.
      if (!isEditMode) {
        originalBlobsRef.current[originalKey] = blob
      }
      // Clear stale editing state so editor reinitializes from fresh values on next open
      setEditingTexts((prev) => { const next = { ...prev }; delete next[originalKey]; return next })

      if (folderHandleRef.current) {
        const fh = await folderHandleRef.current.getFileHandle(filename, { create: true })
        const w = await fh.createWritable()
        await w.write(blob)
        await w.close()
      } else {
        const a = document.createElement('a')
        a.href = previewUrl
        a.download = filename
        a.click()
      }

      // Upload to Google Drive in background
      const sessionFolderId = driveFolderRef.current?.sessionFolderId
      if (sessionFolderId) {
        uploadToDrive(blob, filename, sessionFolderId).catch(() => {})
      }

      // Save pre-logo version to "bez logo" subfolder
      if (noLogoBlob) {
        if (folderHandleRef.current) {
          try {
            const noLogoDir = await folderHandleRef.current.getDirectoryHandle('bez logo', { create: true })
            const fh2 = await noLogoDir.getFileHandle(filename, { create: true })
            const w2 = await fh2.createWritable()
            await w2.write(noLogoBlob)
            await w2.close()
          } catch {}
        } else {
          const a2 = document.createElement('a')
          a2.href = URL.createObjectURL(noLogoBlob)
          a2.download = `bez_logo_${filename}`
          a2.click()
        }
        const noLogoFolderId = driveFolderRef.current?.noLogoFolderId
        if (noLogoFolderId) {
          uploadToDrive(noLogoBlob, filename, noLogoFolderId).catch(() => {})
        }
      }

      updateStatus(fmt.id, { status: 'done' })
      setDoneCount((c) => c + 1)
      evaluateBanner(fmt, blob).catch(() => {})

      // AI caption: fire-and-forget AFTER banner is shown and saved.
      // Adds UI overlay caption + XMP metadata without blocking generation.
      // The caption arrives 3–8s later — the banner is already "done" by then.
      if (!isEditMode) {
        ;(async () => {
          try {
            const captionDataUrl = await blobToDataUrl(blob)
            const captionRes = await fetch('/.netlify/functions/describe-banner', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: captionDataUrl, mediaType: 'image/jpeg', mode: 'caption' }),
            })
            if (!captionRes.ok) return
            const captionData = await captionRes.json()
            const captionText = captionData?.caption
            if (!captionText) return
            setCaptions((prev) => ({ ...prev, [fmt.id]: captionText }))
            // Embed XMP metadata and overwrite the saved file (folder handle path only)
            if (folderHandleRef.current) {
              try {
                const blobWithCaption = await injectXmpDescription(blob, captionText)
                const fh = await folderHandleRef.current.getFileHandle(filename, { create: true })
                const w = await fh.createWritable()
                await w.write(blobWithCaption)
                await w.close()
              } catch {}
            }
          } catch {}
        })()
      }
    } catch (e) {
      // "source image could not be decoded" is a transient fal.ai server error — retry silently
      // (it is NOT a user file-format problem; the same request always succeeds on retry).
      const isTransient = /source image could not be decoded/i.test(e?.message || '')
      if (isTransient && !signal.aborted && _retryCount < 2) {
        await new Promise((r) => setTimeout(r, 1500))
        return generateOne(fmt, signal, textOverrides, _retryCount + 1)
      }
      updateStatus(fmt.id, { status: 'error', message: friendlyError(e) })
    }
  }

  // textOverrides = { headline, cta } — optional, for "Zmień teksty" regeneration
  const retryOne = async (fmt, textOverrides = null) => {
    if (running) return
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller
    await generateOne(fmt, controller.signal, textOverrides)
    setRunning(false)
  }

  const generateAll = async () => {
    if (running) return
    setRunning(true)

    // Reset all per-banner state for a fresh run
    promptsMapRef.current = {}
    textsMapRef.current = {}
    seedMapRef.current = {}
    originalBlobsRef.current = {}
    descriptionsMapRef.current = {}
    layoutRefAnalysisCacheRef.current = {}
    setExpandedPrompts({})
    setExpandedTexts({})
    setEditingTexts({})
    setCaptions({})

    const controller = new AbortController()
    abortRef.current = controller

    const pending = formats.filter((f) => statuses[f.id]?.status !== 'done')

    // ── Layout-ref Vision pre-analysis — run ONCE per unique reference image ──
    // Problem: when multiple layout-ref variants run in parallel (pool limit=3),
    // each fires describe-banner simultaneously → concurrent Claude API calls →
    // some timeout silently (non-fatal catch) → those variants get no analysis
    // injection → much weaker prompt → poor fidelity.
    // Fix: pre-analyze each unique reference image sequentially here, cache the
    // raw analysis JSON by refIndex. generateOne reads from cache instead of
    // calling describe-banner itself.
    const layoutRefPending = pending.filter((f) => f.variantName === 'Ze wzoru referencyjnego')
    if (layoutRefPending.length > 0 && styleReferenceImages?.length > 0) {
      // Compute best reference image index for each layout-ref format, deduplicate
      const refIdxSet = new Set()
      for (const fmt of layoutRefPending) {
        const idx = await pickBestRefIndex(styleReferenceImages, fmt)
        refIdxSet.add(idx)
      }
      // Run Vision analysis sequentially for each unique reference image
      for (const refIdx of refIdxSet) {
        try {
          const refToAnalyze = styleReferenceImages[refIdx]
          const compressed = await compressRefImage(refToAnalyze)
          if (compressed) {
            const analysisRes = await fetch('/.netlify/functions/describe-banner', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: compressed, mediaType: 'image/jpeg', mode: 'layoutref' }),
              signal: controller.signal,
            })
            if (analysisRes.ok) {
              const analysisData = await analysisRes.json()
              if (analysisData.analysis) {
                layoutRefAnalysisCacheRef.current[refIdx] = analysisData.analysis
              }
            }
          }
        } catch {
          // Non-fatal — generateOne will fall back to its own attempt
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Pre-flight: create Drive folders ONCE before parallel uploads.
    if (!driveFolderRef.current) {
      try {
        const res = await fetch('/.netlify/functions/ensure-drive-folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, ''),
            sessionFolder: SESSION_FOLDER,
          }),
        })
        if (res.ok) {
          driveFolderRef.current = await res.json()
        }
      } catch {
        // Drive pre-flight failure is non-fatal
      }
    }

    await runPool(pending.map((fmt) => () => generateOne(fmt, controller.signal)))

    setRunning(false)
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  // Open/close text editor for a banner row
  const toggleTextsEditor = (filename) => {
    const isCurrentlyOpen = !!expandedTexts[filename]

    if (!isCurrentlyOpen) {
      // Initialize form values — always, even if no saved data exists.
      // Priority: editingTexts (already open) → textsMapRef → prompt extraction → empty fields
      if (!editingTexts[filename]) {
        // Level 1: texts saved after generation
        const saved = textsMapRef.current[filename]
        if (saved?.headline) {
          const parts = saved.headline.split('\n').map((s) => s.trim()).filter(Boolean)
          setEditingTexts((prev) => ({
            ...prev,
            [filename]: { primary: parts[0] || '', secondary: parts[1] || '', cta: saved.cta || '' },
          }))
        } else {
          // Level 2: extract from stored prompt (survives re-renders, covers edge cases
          //          where textsMapRef was empty when the button was clicked mid-generation)
          const extracted = extractTextsFromPrompt(promptsMapRef.current[filename])
          const parts = (extracted.headline || '').split('\n').map((s) => s.trim()).filter(Boolean)
          setEditingTexts((prev) => ({
            ...prev,
            [filename]: { primary: parts[0] || '', secondary: parts[1] || '', cta: extracted.cta || '' },
          }))
          // Level 3 is implicit — if both are empty we still set the key, so `ed` is truthy
          // and the form renders with empty fields the user can fill in.
        }
      }
      // Close prompt panel if open
      setExpandedPrompts((prev) => ({ ...prev, [filename]: false }))
    }

    setExpandedTexts((prev) => ({ ...prev, [filename]: !prev[filename] }))
  }

  // Open/close prompt panel — also closes text editor
  const togglePrompt = (filename) => {
    setExpandedTexts((prev) => ({ ...prev, [filename]: false }))
    setExpandedPrompts((prev) => ({ ...prev, [filename]: !prev[filename] }))
  }

  // Evaluate a generated banner against channel-specific quality criteria
  const evaluateBanner = async (fmt, blob) => {
    const fmtId = fmt.id
    setEvaluatingIds((prev) => new Set([...prev, fmtId]))
    try {
      const dataUrl = await blobToDataUrl(blob)
      const compressed = await compressRefImage(dataUrl)
      if (!compressed) return // shouldn't happen for a just-generated JPEG blob, but guard anyway
      const base64 = compressed.split(',')[1]
      const isStories = fmt.channel === 'meta' && fmt.height > fmt.width && fmt.height / fmt.width > 1.5
      const res = await fetch('/.netlify/functions/evaluate-banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          channel: fmt.channel || 'gdn',
          isStories,
          width: fmt.width,
          height: fmt.height,
        }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.verdict) {
        setEvaluations((prev) => ({ ...prev, [fmtId]: data }))
      }
    } catch {}
    finally {
      setEvaluatingIds((prev) => { const s = new Set(prev); s.delete(fmtId); return s })
    }
  }

  // ── Button state — shared between sticky bar and bottom button ──────────────
  const errorCount = Object.values(statuses).filter((s) => s.status === 'error').length
  const allDone = Object.values(statuses).every((s) => s.status === 'done')
  let btnIcon, btnText
  if (running) {
    btnIcon = <Square size={18} strokeWidth={2} fill="currentColor" aria-hidden />
    btnText = 'Zatrzymaj generowanie'
  } else if (allDone) {
    btnIcon = <CheckCircle2 size={18} strokeWidth={2} aria-hidden />
    btnText = 'Wszystkie wygenerowane'
  } else if (errorCount > 0) {
    btnIcon = <RotateCcw size={18} strokeWidth={2} aria-hidden />
    btnText = `Ponów nieudane (${errorCount})`
  } else {
    btnIcon = <Zap size={18} strokeWidth={2} aria-hidden />
    btnText = `Generuj wszystkie (${totalFormats} grafik)`
  }
  const btnDisabled = (!folderName && fsaOk) || allDone
  const btnClassName = `inline-flex items-center justify-center gap-2 w-full rounded-xl font-bold transition-colors
    ${running
      ? 'bg-red-600 text-white hover:bg-red-700'
      : allDone
      ? 'bg-green-600 text-white cursor-default'
      : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-700 dark:disabled:text-gray-500 disabled:cursor-not-allowed'
    }`
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="pb-20">
      {/* Header */}
      <h2 className="text-xl font-bold mb-0.5 text-gray-900 dark:text-white">Banery reklamowe — {brandName}</h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
        {domain} · {totalFormats} grafik
      </p>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mb-4">
        <div
          className="h-1 bg-blue-500 rounded-full transition-all duration-400"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Folder picker */}
      <div className="bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl p-3.5 mb-3 flex items-center gap-3.5">
        <button
          onClick={pickFolder}
          className="inline-flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap hover:bg-gray-800 transition-colors"
        >
          <Folder size={16} strokeWidth={1.8} aria-hidden />
          Wybierz folder
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {folderName ? (
            <>→ <strong className="text-gray-900 dark:text-white">{folderName}</strong> <span className="text-xs text-gray-300 dark:text-gray-600">({doneCount} zapisanych)</span></>
          ) : (
            fsaOk ? 'Wybierz folder docelowy' : '→ pliki trafią do Downloads'
          )}
        </span>
      </div>

      {/* Format grid — responsive: auto-fill cards, fixed min-width */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))' }}>
        {formats.map((fmt) => {
          const st = statuses[fmt.id]
          const model = resolveModel(fmt)
          const preview = previews[fmt.id]
          const caption = captions[fmt.id]
          const filename = makeFilename(domain, fmt)
          const promptText = promptsMapRef.current[filename]
          const isPromptOpen = !!expandedPrompts[filename]
          const isTextsOpen = !!expandedTexts[filename]
          const ed = editingTexts[filename]
          const savedTexts = textsMapRef.current[filename]
          // hasTwoLines: check saved texts first, then fall back to what's in the editor
          // (ed is populated from prompt extraction when savedTexts is unavailable)
          const hasTwoLines = !!(savedTexts?.headline?.includes('\n') || ed?.secondary)

          return (
            <div
              key={fmt.id}
              className={`rounded-xl overflow-hidden transition-colors border
                ${st.status === 'done' ? 'border-brand-green/30 bg-brand-green-light dark:bg-green-950/30' : ''}
                ${st.status === 'error' ? 'border-brand-red/30 bg-brand-red-light dark:bg-red-950/30' : ''}
                ${st.status === 'generating' ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30' : ''}
                ${st.status === 'idle' ? 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50' : ''}`}
            >
              {/* Thumbnail — fixed height 160px, fills card width */}
              <div className="relative w-full h-80 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                {preview ? (
                  <img src={preview} alt={fmt.label} className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-300 dark:text-gray-600">
                    {st.status === 'generating'
                      ? <Zap size={28} strokeWidth={1.6} className="text-blue-500 animate-pulse" aria-hidden />
                      : <ImageIcon size={28} strokeWidth={1.6} aria-hidden />}
                  </div>
                )}
                {/* Caption overlay — bottom strip */}
                {caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/55 px-2.5 py-1.5">
                    <p className="text-white text-[11px] leading-snug line-clamp-2">{caption}</p>
                  </div>
                )}
              </div>

              {/* Card body */}
              <div className="p-3">
                {/* Label + size + status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate text-gray-900 dark:text-white">{fmt.label}{model.needsResize ? <span className="font-normal text-gray-400 dark:text-gray-500"> · {model.ar}→crop</span> : ''}</div>
                  </div>
                  <div className="flex-shrink-0">
                    {st.status === 'done' && (
                      <span className="inline-flex items-center gap-1 text-brand-green text-xs font-semibold whitespace-nowrap">
                        <CheckCircle2 size={14} strokeWidth={1.8} aria-hidden /> zapisano
                      </span>
                    )}
                    {st.status === 'generating' && (
                      <span className="inline-flex items-center gap-1 text-blue-500 text-xs font-semibold whitespace-nowrap">
                        <Zap size={14} strokeWidth={1.8} aria-hidden /> generowanie...
                      </span>
                    )}
                    {st.status === 'idle' && (
                      <span className="inline-flex items-center gap-1 text-gray-300 dark:text-gray-600 text-xs whitespace-nowrap">
                        <Clock size={14} strokeWidth={1.8} aria-hidden /> oczekuje
                      </span>
                    )}
                    {st.status === 'error' && (
                      <span className="inline-flex items-center gap-1 text-brand-red text-xs" title={st.message}>
                        <XCircle size={14} strokeWidth={1.8} aria-hidden className="flex-shrink-0" />
                        <span className="truncate max-w-[100px]">błąd</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Error detail + retry */}
                {st.status === 'error' && (
                  <div className="mb-2">
                    <p className="text-brand-red text-[11px] leading-tight mb-1.5" title={st.message}>{st.message?.slice(0, 80)}</p>
                    <button
                      onClick={() => retryOne(fmt)}
                      disabled={running}
                      className="inline-flex items-center gap-1.5 text-xs bg-gray-900 text-white rounded-lg px-2.5 py-1 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <RotateCcw size={12} strokeWidth={2} aria-hidden /> Ponów
                    </button>
                  </div>
                )}

                {/* Prompt + Zmień teksty buttons (done only) */}
                {st.status === 'done' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => togglePrompt(filename)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors
                        ${isPromptOpen
                          ? 'border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-950/40'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                    >
                      {isPromptOpen ? <ChevronUp size={12} strokeWidth={2} aria-hidden /> : <ChevronDown size={12} strokeWidth={2} aria-hidden />}
                      Prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTextsEditor(filename)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors
                        ${isTextsOpen
                          ? 'border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                    >
                      {isTextsOpen ? <ChevronUp size={12} strokeWidth={2} aria-hidden /> : <Pencil size={12} strokeWidth={1.8} aria-hidden />}
                      Zmień teksty
                    </button>
                  </div>
                )}

                {/* Evaluation */}
                {(evaluatingIds.has(fmt.id) || evaluations[fmt.id]) && (
                  <div className="mt-2">
                    {evaluatingIds.has(fmt.id) && !evaluations[fmt.id] ? (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                        <ShieldCheck size={13} strokeWidth={1.8} className="animate-pulse" aria-hidden />
                        Ocenianie zgodności z kanałem…
                      </div>
                    ) : evaluations[fmt.id] ? (
                      <div>
                        {/* Compact badge row */}
                        <button
                          type="button"
                          onClick={() => setExpandedEvals((prev) => ({ ...prev, [fmt.id]: !prev[fmt.id] }))}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-colors
                            border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white/60 dark:bg-black/20"
                        >
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck
                              size={13} strokeWidth={1.8} aria-hidden
                              className={
                                evaluations[fmt.id].verdict === 'ready' ? 'text-green-500' :
                                evaluations[fmt.id].verdict === 'review' ? 'text-amber-500' : 'text-red-500'
                              }
                            />
                            <span className={`text-xs font-semibold
                              ${evaluations[fmt.id].verdict === 'ready' ? 'text-green-600 dark:text-green-400' :
                                evaluations[fmt.id].verdict === 'review' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}
                            >
                              {evaluations[fmt.id].verdict === 'ready' ? 'Gotowy' :
                               evaluations[fmt.id].verdict === 'review' ? 'Wymaga sprawdzenia' : 'Niezalecany'}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {evaluations[fmt.id].score}/100 · {evaluations[fmt.id].channel_label}
                            </span>
                          </div>
                          {expandedEvals[fmt.id]
                            ? <ChevronUp size={12} strokeWidth={2} className="text-gray-400 flex-shrink-0" aria-hidden />
                            : <ChevronDown size={12} strokeWidth={2} className="text-gray-400 flex-shrink-0" aria-hidden />}
                        </button>

                        {/* Expanded flags */}
                        {expandedEvals[fmt.id] && (
                          <div className="mt-1.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-white/40 dark:bg-black/20 divide-y divide-gray-100 dark:divide-gray-800">
                            {evaluations[fmt.id].flags.map((flag) => (
                              <div key={flag.id} className="flex items-start gap-2 px-2.5 py-1.5">
                                <span className="flex-shrink-0 mt-0.5 text-sm leading-none">
                                  {flag.status === 'pass' ? '✅' : flag.status === 'warn' ? '⚠️' : '❌'}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 leading-snug">{flag.name}</div>
                                  <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">{flag.note}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Expandable: prompt viewer */}
              {isPromptOpen && promptText && (
                <div className="px-3 pb-3 border-t border-black/10 dark:border-white/5 pt-2.5">
                  <textarea
                    readOnly
                    value={promptText}
                    onClick={(e) => e.target.select()}
                    className="w-full h-40 text-[11px] font-mono bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-gray-700 dark:text-gray-300 resize-y focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Kliknij w pole → Ctrl+A żeby zaznaczyć wszystko</p>
                </div>
              )}

              {/* Expandable: text editor */}
              {isTextsOpen && ed && (
                <div className="px-3 pb-3 border-t border-black/10 dark:border-white/5 pt-2.5 space-y-2.5">
                  {/* Headline — 1 or 2 fields depending on original structure */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
                      {hasTwoLines ? 'Nagłówek główny (duży)' : 'Nagłówek'}
                    </label>
                    <input
                      type="text"
                      value={ed.primary}
                      onChange={(e) => setEditingTexts((prev) => ({
                        ...prev, [filename]: { ...prev[filename], primary: e.target.value },
                      }))}
                      className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                    />
                  </div>

                  {hasTwoLines && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
                        Podtytuł (mniejszy)
                      </label>
                      <input
                        type="text"
                        value={ed.secondary}
                        onChange={(e) => setEditingTexts((prev) => ({
                          ...prev, [filename]: { ...prev[filename], secondary: e.target.value },
                        }))}
                        className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
                      Tekst CTA (przycisk)
                    </label>
                    <input
                      type="text"
                      value={ed.cta}
                      onChange={(e) => setEditingTexts((prev) => ({
                        ...prev, [filename]: { ...prev[filename], cta: e.target.value },
                      }))}
                      className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const headline = (hasTwoLines && ed.secondary.trim())
                        ? `${ed.primary}\n${ed.secondary}`
                        : ed.primary
                      setExpandedTexts((prev) => ({ ...prev, [filename]: false }))
                      retryOne(fmt, { headline, cta: ed.cta })
                    }}
                    disabled={running || !ed.primary.trim()}
                    className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg px-4 py-2.5 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw size={16} strokeWidth={1.8} aria-hidden />
                    Regeneruj z nowymi tekstami
                  </button>

                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    {imageModel === 'gpt-image-2'
                      ? 'Prompt zostanie zaktualizowany z nowymi tekstami i baner wygenerowany ponownie. Kompozycja może się nieznacznie różnić.'
                      : 'Tylko teksty zostaną podmienione — styl, układ i grafika pozostają bez zmian.'}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Generate button — bottom anchor (end of list) */}
      <button
        onClick={running ? stopGeneration : generateAll}
        disabled={btnDisabled}
        className={`${btnClassName} py-4 text-base`}
      >
        {btnIcon}
        {btnText}
      </button>

      {/* ── Sticky bottom bar — always visible ───────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.10)] px-4 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3">
          <button
            onClick={running ? stopGeneration : generateAll}
            disabled={btnDisabled}
            className={`${btnClassName} flex-1 py-3 text-sm`}
          >
            {btnIcon}
            {btnText}
          </button>
          <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap tabular-nums">
            {doneCount}/{totalFormats}
            {running && progress > 0 && (
              <span className="ml-1 text-blue-500">{Math.round(progress)}%</span>
            )}
          </div>
        </div>
      </div>
      {/* ──────────────────────────────────────────────────────────────────────── */}

    </div>
  )
}
